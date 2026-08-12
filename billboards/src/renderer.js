// The offscreen renderer: (character, state, time) -> a texture of the posed
// figure, cached.
//
// One WebGL canvas serves every fighter. A render happens only when a pose the
// cache has never seen is asked for; the cache key is the quantised pose token,
// so the economics rest on the fact that most states are holds — an idle
// fighter costs about two renders a second and a match spends most frames at
// 100% cache hits. Stats are exported (and mirrored onto window.__billboards)
// so the smoke tests can assert that instead of taking it on faith.
//
// FRAMING. The camera is orthographic and fixed for everyone: yawed 30° to the
// ¾-right view the sprite art is drawn in, pitched down a touch. The frustum
// is sized per rig from its real height so that:
//
//   * the figure fills a predictable fraction of the texture, and
//   * the FOOT LINE (world y=0) lands at a known row — FOOT_FRAC up from the
//     bottom — which is what lets blit.js anchor feet to (x, y) with no
//     per-pose measuring. Margin above and to the sides absorbs raised arms
//     and lunges; a pose that escapes the frame clips, visibly, which is a
//     workbench-visible authoring fault rather than a silent one.
//
// The texture rows-per-metre that framing implies is reported alongside the
// canvas, so the blit can convert game-pixel height to texture scale exactly.

import { clipNameFor, clipTime, aimable, aimKey } from "../../render3d/src/states.js";
import { getRig } from "../../render3d/src/loader.js";
import { swayChains, simulateChains, simulates } from "../../render3d/src/props.js";
import { poseRig, sampleTime, initPose } from "../../render3d/src/pose.js";
import { initLayerAxes } from "../../render3d/src/ik.js";

export const TEX_SIZE = 384;
/** Fraction of the frame height under the foot line (world y = 0). */
export const FOOT_FRAC = 0.10;
/** Frustum height as a multiple of rig height: headroom for raised arms. */
const FRAME_MUL = 1.45;
/** Pose time quantisation, seconds. 30 Hz: coarse enough to cache, finer than
 *  any sprite anim's frame rate, so nothing animates more coarsely than the
 *  sprites it replaces. */
export const QUANT = 1 / 30;

/** Camera yaw in degrees — see the note in frameCamera. Exposed so the
 *  workbench (and the framing sweep that chose this value) can turn it
 *  without editing the constant. */
export let CAMERA_YAW_DEG = -60;
export function setCameraYaw(deg) { CAMERA_YAW_DEG = deg; }

const CACHE_MAX = 128; // ~19 MB at 384² RGBA; floor set by the trail window

let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let lights = null;

const cache = new Map(); // token -> { canvas, rowsPerMetre }
export const stats = { renders: 0, hits: 0, misses: 0, evictions: 0 };

export function initRenderer(three) {
  THREE = three;
  // The lateral axis table is shared scratch the IK reads; the pose layers
  // themselves live in render3d/src/pose.js and hold their own.
  initLayerAxes(THREE);
  initPose(three);
  _camRight = new THREE.Vector3();
  _target = new THREE.Vector3();
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  // Flat, directionless-enough light: shape without drama. Real look-dev is
  // phase B4; this just has to keep a grey mannequin readable.
  lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xf4f6ff, 0x3a4152, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 2.5, 2.0);
  lights.add(key);
  scene.add(lights);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  // Instrumentation for the smoke tests and for /workbench debugging.
  if (typeof window !== "undefined") {
    window.__billboards = window.__billboards || {};
    window.__billboards.stats = stats;
  }
}

/** The cache key for a pose. Quantised so consecutive frames of a held pose
 *  hash equal; facing is NOT in the key — mirroring happens at blit time —
 *  but AIM is: two strikes pitched at different targets are different poses.
 *  (aimPitch in states.js already quantised the angle to 6° steps, so the
 *  aim dimension stays small.) */
/** The camera, for tools that need its basis (the IK accuracy probe). */
export function __cam() { return camera; }

export function poseToken(charKey, animKey, animTime, aim = null) {
  const t = clipTime(animKey, animTime);
  const a = aimable(animKey) && aim ? aimKey(aim) : "";
  return `${charKey}/${clipNameFor(animKey)}@${Math.round(t / QUANT)}${a}`;
}

let _camRight = null;
let _target = null;

/** The reach target as a world point, built along the CAMERA's right axis.
 *
 *  `aim.dx` is how far across the frame the strike should land, in the same
 *  pixels the sprite's reach was measured in, and this camera never moves — so
 *  screen-right is a fixed world direction and the card can be solved against
 *  it directly. */
function screenTarget(aim, rigHeightM, targetPx) {
  const mPerPx = rigHeightM / Math.max(1, targetPx);
  _camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  return _target
    .set(0, aim.dy * mPerPx, 0)
    .addScaledVector(_camRight, aim.dx * mPerPx);
}

function frameCamera(height) {
  // Ortho extents are CAMERA-relative, not world heights: the view axis maps
  // to the frame's centre row. So the foot-line guarantee is arranged by
  // aiming the camera horizontally at the frustum's world-space centre — the
  // axis sits at cy, the frame spans cy ± frameH/2, and world y=0 lands
  // exactly FOOT_FRAC up from the bottom. (A pitched camera would smear that
  // row across depth, which is why the ¾ view is yaw-only.)
  const frameH = height * FRAME_MUL;
  const half = frameH / 2;
  camera.left = -half;
  camera.right = half;
  camera.top = half;
  camera.bottom = -half;
  const cy = frameH * (0.5 - FOOT_FRAC);
  // Yaw. Two things must hold at once, and eyeballing a 384px render gets one
  // of them wrong every time — so they are stated as dot products and measured
  // (tools/smoke_facing.mjs):
  //
  //   forward · cameraRight  > 0   the fighter faces SCREEN-RIGHT
  //   forward · (-cameraFwd) > 0   and his FRONT is toward the lens
  //
  // With the rig's forward at +Z (the delivery spec), those are -sin(yaw) and
  // cos(yaw) — both positive only for -90° < yaw < 0°. -60° puts forward
  // mostly across the screen (0.87) with the chest still turned toward the
  // viewer (0.5): the three-quarter the sprite art is drawn at. The original
  // +30° satisfied neither, which is why every fighter strode into the screen
  // and showed their back.
  const yaw = (CAMERA_YAW_DEG * Math.PI) / 180;
  const dist = 10;
  camera.position.set(Math.sin(yaw) * dist, cy, Math.cos(yaw) * dist);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
  // lookAt sets the quaternion but leaves matrixWorld stale until something
  // renders. The IK reads its screen-right axis out of that matrix, so without
  // this the FIRST aimed strike after any reframe solves against the previous
  // camera and reaches in the wrong direction — and only that one, which is
  // exactly the kind of fault that survives a casual look.
  camera.updateMatrixWorld(true);
}

/** Real seconds since the last simulated frame.
 *
 *  Simulated chains need WALL-CLOCK time, not clip time: clip time restarts
 *  every state change and runs backwards on a loop, and an integrator fed
 *  that would kick the hair on every transition. Clamped by the simulator
 *  itself, so a backgrounded tab resuming does not integrate a minute of
 *  gravity in one step. */
let _lastSimT = 0;
function frameDelta() {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const dt = _lastSimT ? now - _lastSimT : 1 / 60;
  _lastSimT = now;
  return dt;
}

/** The posed character as a canvas, plus the metres->rows mapping the blit
 *  needs. Returns null when the character has no rig or no resolvable clip —
 *  the caller falls back to sprites. */
export function renderPose(charKey, animKey, animTime, resolveClip, aim = null, targetPx = 0) {
  const token = poseToken(charKey, animKey, animTime, aim);
  // A fighter with a SIMULATED chain cannot use the cache, and must not be
  // allowed to poison it either. The integrator carries state, so the same
  // token legitimately draws different pixels one frame to the next — that is
  // the entire point of it (props.js simulateChains states the trade). Serving
  // such a fighter a cache hit would freeze their hair mid-swing; storing one
  // would hand a stale swing to the afterimage trail.
  const live = simulates(charKey);
  const hit = live ? null : cache.get(token);
  if (hit) {
    stats.hits++;
    // Refresh LRU position.
    cache.delete(token);
    cache.set(token, hit);
    return hit;
  }
  stats.misses++;

  const rig = getRig(charKey);
  if (!rig || !renderer) return null;
  const resolved = resolveClip(charKey, animKey);
  if (!resolved) return null;

  // POSING IS NOT THIS BACKEND'S JOB. Every layer that puts a body in a
  // position — the clip, the facing correction, stance, morphs, aim, reach,
  // the two-handed grip, look, flinch, breath, foot planting, pose edits —
  // belongs to the model pipeline in render3d/src/pose.js, and this backend
  // draws whatever that produces. It used to run its own copy of that sequence
  // and the copies drifted: this one had no breath, no foot planting and no
  // pose edits, and applied stance in a different place.
  //
  // What is left below IS this backend: render the posed rig once through a
  // fixed ¾ ortho camera, keep the pixels, hand back a card.
  // Frame the camera BEFORE the reach target is built. The target is a world
  // point along the camera's right axis, so it reads `camera.matrixWorld` —
  // and this camera is re-aimed per fighter height. Building the target first
  // solved the strike against the PREVIOUS fighter's camera, which is worth 49°
  // of error on a level strike and none at all on a high or low one, because
  // those clamp to an elevation the frame does not affect.
  frameCamera(rig.height);
  poseRig(rig, animKey, sampleTime(animKey, animTime), resolved.clip, {
    charKey,
    aimRad: aim ? aim.pitch : 0,
    // Handed over as a world POINT rather than as dx/dy, because on a card
    // `dx` is across the SCREEN — see applyMachineReach.
    reachTarget: aim && targetPx > 0 ? screenTarget(aim, rig.height, targetPx) : null,
    stanceDeg: rig.stanceDeg || 0,
    // No turnaround layer: a card is MIRRORED at blit time to face left
    // (blit.js), which is the whole economy of a card — one render serves both
    // directions. render3d turns the rig instead, because a mirrored mesh
    // inverts its winding.
    turnYawRad: 0,
  });
  // Secondary motion — braids, tendrils — driven by the same quantised clock
  // as the pose, so the cache stays honest (props.js explains the trade).
  swayChains(rig.root, clipTime(animKey, animTime), charKey);
  // ...except where a chain asked to be simulated, which is driven by REAL
  // elapsed time instead, so it can lag the body rather than move with it.
  if (live) simulateChains(THREE, rig.root, frameDelta(), charKey);
  frameCamera(rig.height);
  scene.add(rig.root);
  renderer.render(scene, camera);
  scene.remove(rig.root);
  // Put the root back, exactly as render3d's scene.js does: the yaw belongs to
  // the DRAW, and leaving a rig turned would hand the next reader — a
  // workbench overlay, a measurement — a model in a pose nothing asked for.
  rig.root.rotation.y = 0;
  stats.renders++;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);

  const entry = {
    canvas,
    heightM: rig.height,
    // The hand-set size dial, kept beside the height rather than folded into
    // it: `heightM` stays the honest measurement and each consumer applies the
    // artist's intent explicitly (src/camera3d/billboards.js already reads it).
    renderScale: rig.renderScale ?? 1,
    rowsPerMetre: TEX_SIZE / (rig.height * FRAME_MUL),
    source: resolved.source,
  };
  if (live) return entry;   // never stored: see the note at the cache read
  cache.set(token, entry);
  if (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
    stats.evictions++;
  }
  return entry;
}
