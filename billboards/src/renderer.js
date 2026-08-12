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

import { STATES, clipNameFor, clipTime, aimable, aimKey } from "./states.js";
import { getRig } from "./rig.js";
import { swayChains, simulateChains, simulates } from "./props.js";
import {
  applyReach, reaches, makeScratch, applyTwoHandGrip, applyMorphs,
  characterLateral, rotateBoneAboutWorldAxis, initLayerAxes, applyStance,
} from "./ik.js";

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
  _lateral = new THREE.Vector3();
  _ik = makeScratch(THREE);
  initLayerAxes(THREE);
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

/** Aim: pitch the strike toward the target. Applied AFTER the clip poses the
 *  body, split across the spine so the whole upper body leans into the shot
 *  rather than the torso snapping alone. Clips are authored aim-neutral
 *  (docs/asset-requests.md); this is the only place aim touches a pose. */
// Shares were set when the spine was the ONLY thing that aimed — it had to
// carry the whole read, so it leaned hard. Now the IK places the limb and the
// spine only has to supply body English, so these are softer: a big lean on
// top of a correctly-aimed arm reads as a fighter falling over backwards.
const AIM_BONES = [["Spine1", 0.20], ["Spine2", 0.26], ["Neck", -0.18]];
function applyAim(root, pitchRad) {
  if (!pitchRad) return;
  // The nod axis is the CHARACTER's lateral direction, not the bone's local X.
  // Local X is the nodding axis only on a rig built that way; on a generated
  // one whose neck carries its own roll, aiming about it yaws and rolls the
  // head instead of pitching it (ik.js). Screen-up aim = lean back = negative.
  characterLateral(THREE, root, _lateral);
  for (const [name, share] of AIM_BONES) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    // The Neck takes a counter-share so the head keeps facing the target
    // rather than the sky.
    rotateBoneAboutWorldAxis(THREE, bone, _lateral, -pitchRad * share, _ik);
  }
}
let _lateral = null;
let _ik = null;
let _camRight = null;
let _target = null;

/** The aim target, in the MODEL's own space.
 *
 *  The offsets arrive in game pixels along the fighter's facing and up from
 *  their feet (states.js aimSolve). Two conversions land them in the scene:
 *  metres per pixel comes from the rig's real height against the pixels it
 *  occupies on screen, and "along the facing" becomes the camera's own right
 *  axis — the camera is yaw-only, so screen-up is world Y exactly and screen
 *  right is the camera's X column. Working in the camera's basis rather than
 *  the model's means the hand lands where it LOOKS like it should, which is
 *  the only thing a billboarded fighter can be judged on.
 *
 *  Mirroring is not applied here: the blit mirrors the finished texture, and
 *  the offsets were already measured along the facing, so one rendered pose
 *  serves both directions and the cache stays half the size. */
function targetInModelSpace(aim, rigHeightM, targetPx) {
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

function pose(rig, animKey, animTime, clip) {
  const name = clipNameFor(animKey);
  let action = rig.actions.get(name);
  if (!action || action.getClip() !== clip) {
    rig.mixer.stopAllAction();
    // Cached actions bind clip tracks to bones once; a state whose resolved
    // clip changed (workbench edited inheritance) rebinds here.
    action = rig.mixer.clipAction(clip);
    rig.actions.set(name, action);
  }
  if (!action.isRunning()) {
    rig.mixer.stopAllAction();
    action.reset().play();
  }
  rig.mixer.setTime(clipTime(animKey, animTime));
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

  pose(rig, animKey, animTime, resolved.clip);
  // The rig's own orientation correction, applied before anything reads a
  // world position off it — the aim solve and the reach IK both do, and both
  // are wrong by exactly this angle if it lands afterwards. `pose()` restores
  // the clip's own root track every frame, so this is re-applied every frame
  // rather than once at load.
  rig.root.rotation.y = rig.yawOffset || 0;
  // How wide they plant their feet is a fact about the fighter, the same way
  // their height is — part of how big they READ — so it belongs here beside the
  // facing rather than in whatever posed them.
  applyStance(THREE, rig.root, rig.stanceDeg || 0, _ik);
  // Body morphs (Mahito's transfiguration arms) come FIRST among the layers:
  // aim and reach must solve against the limb's morphed length.
  applyMorphs(rig.root, charKey, animKey, clipTime(animKey, animTime));
  if (aimable(animKey) && aim) {
    // Lean into it, then REACH for it. Order matters: the spine pitch moves
    // the shoulder, so solving the arm first would aim it from a position the
    // body is about to leave.
    applyAim(rig.root, aim.pitch);
    frameCamera(rig.height);
    if (reaches(animKey) && targetPx > 0) {
      applyReach(THREE, rig.root, animKey, clipTime(animKey, animTime),
        targetInModelSpace(aim, rig.height, targetPx), _ik);
    }
  }
  // The off hand joins a two-handed weapon LAST among the arm layers: the
  // shaft rides the striking hand, so this has to see where aim and reach
  // finally put it (ik.js applyTwoHandGrip; a no-op for one-handed fighters).
  applyTwoHandGrip(THREE, rig.root, charKey, animKey,
    clipTime(animKey, animTime), _ik);
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
