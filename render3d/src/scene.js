// The offscreen scene: (character, state, time, live layers) -> a texture of
// the anime-shaded figure, cached.
//
// The billboard renderer's shape, kept deliberately — one shared WebGL canvas,
// one render only when the cache misses, foot line at a known row so the blit
// anchors feet with no per-pose measuring — with the three changes this
// backend exists for:
//
//   * PERSPECTIVE, NOT ORTHO. A long lens (FOV 15°) framing the fighter: limbs
//     stay undistorted, but a strike toward the lens actually foreshortens —
//     sprites never could. The camera still aims horizontally at the frustum
//     centre, so the foot-line guarantee survives (see frameCamera).
//   * SUPERSAMPLE 2×. Rendered at twice the cached size and downsampled once,
//     which is what keeps 1-px ink lines crisp instead of shimmering.
//     Premultiplied alpha, so edges composite cleanly over painted stages.
//   * LIT BY THE ROOM. The light rig re-keys per stage: key color from the
//     stage `tint`, rim pushed into the toon materials. The light key joins
//     the pose token, so a stage change (or a domain) re-renders instead of
//     serving stale light from the cache.
//
// THE CACHE still carries the economics: on-twos sampling (pose.js) means a
// fighter re-renders SAMPLE_HZ times a second at worst, and the 17 held
// states collapse to almost nothing. The floor on CACHE_MAX is the afterimage
// trail window, same as billboards. Same token -> same pixels, byte for byte
// — the determinism smoke asserts it, because the trail replays tokens.

import { clipNameFor, aimable } from "../../billboards/src/states.js";
import { swayChains, simulateChains, simulates } from "../../billboards/src/props.js";
import { state } from "../../src/state.js";
import { getStage } from "../../src/stages.js";
import { DIALS, sampleTime, poseRig } from "./pose.js";
import { setRimColor } from "./toon.js";
import { setWorldWidth, OUTLINE } from "./outline.js";

export const TEX_SIZE = 384;
export const SUPERSAMPLE = 2;
/** Fraction of the frame height under the foot line (world y = 0). */
export const FOOT_FRAC = 0.10;
/** Frustum height as a multiple of rig height: headroom for raised arms and
 *  lunges toward the lens. */
const FRAME_MUL = 1.5;
const FOV_DEG = 15;

const CACHE_MAX = 160; // floor set by the trail window, same as billboards

let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let keyLight = null;
let hemiLight = null;
let rimStage = null; // last stage key the light rig was derived from

const cache = new Map(); // token -> { canvas, heightM, rowsPerMetre, yawed }
export const stats = { renders: 0, hits: 0, misses: 0, evictions: 0 };

export function initScene(three) {
  THREE = three;
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE * SUPERSAMPLE;
  canvas.height = TEX_SIZE * SUPERSAMPLE;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  hemiLight = new THREE.HemisphereLight(0xf4f6ff, 0x3a4152, 2.2);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
  keyLight.position.set(1.5, 2.5, 2.0);
  scene.add(hemiLight, keyLight);
  camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 80);
  _proj = new THREE.Vector3();
  if (typeof window !== "undefined") {
    window.__render3d = window.__render3d || {};
    window.__render3d.stats = stats;
  }
}

/** Point the key light somewhere else — the workbench's sweeping-light check
 *  for edited normals. angleRad orbits the light around the figure. */
export function setKeyLightAngle(angleRad, elevRad = 0.8) {
  keyLight.position.set(
    Math.sin(angleRad) * 2.5,
    Math.sin(elevRad) * 3.0,
    Math.cos(angleRad) * 2.5,
  );
}

// ------------------------------------------------------- stage light rig

/** Parse the "rgba(r, g, b, a)" strings stages.js uses. */
function parseTint(tint) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(tint || "");
  return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : null;
}

/** The part of the cache key that owns lighting: when the stage (or a
 *  domain) re-keys the light, tokens change and stale renders age out of
 *  the LRU instead of being served. */
export function lightKey() {
  return `${state.stageKey || "-"}${state.domain ? "+dom" : ""}`;
}

/** The stage's light, as numbers — key colour and rim colour derived from the
 *  stage `tint`. Exported because the 2.5D camera builds its OWN light rig
 *  (it puts the actual rig in its own scene rather than taking a texture from
 *  this one) and both must agree, or the same fighter is lit two ways
 *  depending on a URL flag. Returns null for a stage with no tint. */
export function stageLightTint() {
  const tint = parseTint(getStage?.(state.stageKey)?.tint);
  if (!tint) return null;
  const boost = 0.55;
  return {
    // Key colour leans toward the stage tint...
    key: [1 - (1 - tint[0]) * 0.35, 1 - (1 - tint[1]) * 0.35, 1 - (1 - tint[2]) * 0.35],
    // ...and the rim takes it brightened — the thin stage-coloured line that
    // seats a figure against a painted room.
    rim: [tint[0] + (1 - tint[0]) * boost,
          tint[1] + (1 - tint[1]) * boost,
          tint[2] + (1 - tint[2]) * boost],
  };
}

function syncStageLight() {
  const key = lightKey();
  if (key === rimStage) return;
  rimStage = key;
  const t = stageLightTint();
  if (!t) return;
  keyLight.color.setRGB(...t.key);
  setRimColor(...t.rim);
}

// ------------------------------------------------------------ framing

/**
 * FREE LOOK, for inspecting a model rather than playing it.
 *
 * The match camera is fixed on purpose: one ¾ angle for the whole roster, so
 * every fighter is drawn under the same lens and can be compared. But a
 * delivery has to be LOOKED at — is the back of the coat modelled, does the
 * hair intersect the shoulder, is that hand a hand — and none of that is
 * answerable from the one angle the game happens to use.
 *
 * So the orbit is a workbench-only offset ON the match camera, not a second
 * camera: same framing arithmetic, same lens, same lights. Zeroed, it is
 * exactly the shot the game renders, which is what makes turning it off a
 * return to the truth rather than to another approximation.
 */
const orbit = { yawRad: 0, pitchRad: 0, dolly: 1 };

export function setOrbit({ yawDeg = 0, pitchDeg = 0, dolly = 1 } = {}) {
  orbit.yawRad = (yawDeg * Math.PI) / 180;
  // Short of the poles: at 90° the camera is looking straight down its own up
  // vector and lookAt has no answer, which shows up as the model flipping.
  orbit.pitchRad = (Math.max(-80, Math.min(80, pitchDeg)) * Math.PI) / 180;
  orbit.dolly = Math.max(0.3, Math.min(4, dolly));
}

/** Part of the pose-cache key: a different angle is different pixels. */
export function orbitKey() {
  return orbit.yawRad || orbit.pitchRad || orbit.dolly !== 1
    ? `${Math.round((orbit.yawRad * 180) / Math.PI)},${Math.round((orbit.pitchRad * 180) / Math.PI)},${orbit.dolly.toFixed(2)}`
    : "";
}

function frameCamera(height, parallaxRad = 0) {
  // Same guarantee as the billboard renderer, restated for perspective: the
  // camera aims HORIZONTALLY at the frustum's world-space centre cy, and its
  // distance is chosen so the frustum spans frameH at the character plane —
  // so world y=0 lands exactly FOOT_FRAC up from the frame bottom, and
  // blit.js can anchor feet from two constants. The ¾ view is yaw-only; the
  // micro-parallax rides on top of the base yaw.
  const frameH = height * FRAME_MUL;
  const cy = frameH * (0.5 - FOOT_FRAC);
  const dist = (frameH / 2) / Math.tan((FOV_DEG / 2) * Math.PI / 180);
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
  const yaw = CAMERA_YAW_RAD + parallaxRad + orbit.yawRad;
  // The orbit rides on top: same aim point, same framing, a different seat.
  const d = dist / orbit.dolly;
  const flat = Math.cos(orbit.pitchRad) * d;
  camera.position.set(Math.sin(yaw) * flat, cy + Math.sin(orbit.pitchRad) * d, Math.cos(yaw) * flat);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
}

export const CAMERA_YAW_DEG = -60;
const CAMERA_YAW_RAD = (CAMERA_YAW_DEG * Math.PI) / 180;

/**
 * The rig yaw that makes a fighter face SCREEN-LEFT with his front still
 * toward the lens — this backend's answer to facing, since it turns the model
 * rather than mirroring the picture.
 *
 * It is NOT 180°. Turning a fighter around in place only reads as a
 * turnaround when the camera is side-on; under a three-quarter camera it
 * hands the viewer his BACK, which is exactly what it did — Yuji faced away
 * whenever he moved left, while the billboard backend (which mirrors the
 * texture) looked right.
 *
 * The yaw wanted is the one that REFLECTS his forward across the camera's
 * view plane, because that is what mirroring the picture does geometrically.
 * Reflecting (0,0,1) in the plane whose normal is the camera's right axis
 * (cos θ, 0, −sin θ) gives (sin 2θ, 0, cos 2θ) — a rig yaw of exactly 2θ. At
 * θ = −60° that is −120°, not 180°, and the two coincide only at θ = ±90°:
 * a side-on camera, which is the case the 180° was silently assuming.
 *
 * Rotating rather than mirroring is still the point: the model is never
 * flipped, so an asymmetric costume, a scar or a one-shouldered cloak stays
 * on the side it belongs on. The viewer simply sees his other flank, which is
 * what really happens when someone turns to face the other way.
 */
export function turnaroundYaw() {
  return 2 * CAMERA_YAW_RAD;
}

// ------------------------------------------------------------- the render

/** The cache key for one drawable pose. Every live layer is quantised by the
 *  caller, so the dimensions stay small; facing joins as the turn yaw (the
 *  turnaround replaces blit-time mirroring). */
/** `layers` with the rig's own stance folded in, unless the caller pinned
 *  one (the workbench does, while the slider is being dragged). */
function withStance(rig, layers) {
  const deg = layers.stanceDeg ?? rig?.stanceDeg ?? 0;
  return deg ? { ...layers, stanceDeg: deg } : layers;
}

export function poseToken(charKey, animKey, animTime, layers) {
  const s = sampleTime(animKey, animTime);
  const q = Math.round(s * 720); // exact at any sane sample rate
  const aim = aimable(animKey) && layers.aimRad ? `~a${Math.round((layers.aimRad * 180) / Math.PI)}` : "";
  const look = layers.lookRad ? `~l${Math.round((layers.lookRad * 180) / Math.PI)}` : "";
  const fl = layers.flinch ? `~f${layers.flinch}` : "";
  const turn = layers.turnYawRad ? "~y180" : "";
  // Reach joins the key: two strikes solved onto different targets are two
  // different poses, and a cache that ignored that would serve the first one
  // for every angle after it.
  const rch = layers.reach && aimable(animKey)
    ? `~r${layers.reach.dx},${layers.reach.dy}` : "";
  const par = layers.parallaxDeg ? `~p${layers.parallaxDeg}` : "";
  // Stance changes the silhouette, so it changes the pose, so it changes the
  // key — a cache that ignored it would keep serving the old stance.
  const st = layers.stanceDeg ? `~s${layers.stanceDeg}` : "";
  // Workbench pose edits: never set in game, but when they are set they change
  // pixels, so they have to change the token or the cache serves the un-edited
  // body forever.
  const ed = layers.editKey ? `~e${layers.editKey}` : "";
  const orb = orbitKey();
  return `${charKey}/${clipNameFor(animKey)}@${q}${aim}${look}${fl}${turn}${rch}${par}${st}${ed}`
    + `${orb ? `~o${orb}` : ""}~L${lightKey()}`;
}

/** For the determinism smoke: drop every cached render. */
export function clearCache() {
  cache.clear();
}

/**
 * The posed, toon-shaded character as a canvas, plus the metres->rows
 * mapping the blit needs. Returns null when the character has no rig or no
 * resolvable clip — the caller falls back to sprites.
 */
/** The camera, for the facing/framing probes. */
export function __cam() { return camera; }

// ------------------------------------------------- workbench: bone gizmos
//
// The pose editor draws a handle on every joint and drags them, which needs
// two things the render path does not expose: world matrices that MATCH the
// pixels on screen, and the projection that put them there. A cache hit never
// poses the rig, so the handles would drift onto a pose that is no longer
// drawn — hence a preview pass that poses and frames without rendering.

/** Pose `rig` and frame the camera exactly as `renderPose` would, but draw
 *  nothing. Returns false when there is nothing to pose. */
export function posePreview(charKey, animKey, animTime, rig, resolved, layers = {}) {
  if (!rig || !resolved) return false;
  layers = withStance(rig, layers);
  const sampled = sampleTime(animKey, animTime);
  poseRig(rig, animKey, sampled, resolved.clip, { ...layers, charKey });
  swayChains(rig.root, sampled, charKey);
  frameCamera(rig.height, (layers.parallaxDeg || 0) * Math.PI / 180);
  rig.root.updateMatrixWorld(true);
  return true;
}

/** A world point -> pixel coordinates in the cached TEX_SIZE texture, under
 *  the camera framing left by the last render or preview. The workbench turns
 *  those into canvas pixels with blit.js's placement arithmetic. */
export function projectToTexture(worldVec, out = {}) {
  if (!camera) return null;
  const v = _proj.copy(worldVec).project(camera);
  out.u = (v.x * 0.5 + 0.5) * TEX_SIZE;
  out.v = (0.5 - v.y * 0.5) * TEX_SIZE;
  out.z = v.z; // NDC depth: >1 is behind the camera, and must not draw
  return out;
}
let _proj = null;

/** Real seconds since the last simulated frame — see the same helper in
 *  billboards/src/renderer.js for why simulated chains need wall-clock time
 *  rather than clip time. */
let _lastSimT = 0;
function frameDelta() {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const dt = _lastSimT ? now - _lastSimT : 1 / 60;
  _lastSimT = now;
  return dt;
}

export function renderPose(charKey, animKey, animTime, rig, resolved, layers = {}) {
  // The fighter's stance rides on the RIG, not on the caller. Every layer
  // above is something about this moment — where they are aiming, who hit
  // them — while stance is a fact about the fighter, so taking it from the
  // rig here means the game, the workbench and the 2.5D camera all get it
  // without three copies of the same lookup drifting apart.
  layers = withStance(rig, layers);
  const token = poseToken(charKey, animKey, animTime, layers);
  // Simulated chains carry state, so the same token draws different pixels by
  // design — such a fighter neither reads nor writes the cache. props.js
  // simulateChains states the trade; the note in billboards/src/renderer.js
  // spells out what a stale hit would look like.
  const live = simulates(charKey);
  const hit = live ? null : cache.get(token);
  if (hit) {
    stats.hits++;
    cache.delete(token);
    cache.set(token, hit); // refresh LRU position
    return hit;
  }
  stats.misses++;
  if (!rig || !resolved || !renderer) return null;

  syncStageLight();
  const sampled = sampleTime(animKey, animTime);
  poseRig(rig, animKey, sampled, resolved.clip, { ...layers, charKey });
  // Secondary motion on the same quantised clock as the pose — cache-honest.
  swayChains(rig.root, sampled, charKey);
  // ...except chains that asked to be simulated, driven by real elapsed time.
  if (live) simulateChains(THREE, rig.root, frameDelta(), charKey);
  frameCamera(rig.height, (layers.parallaxDeg || 0) * Math.PI / 180);

  // Outline width: OUTLINE.px is in blitted pixels; the texture holds
  // frameH world-units across TEX_SIZE of them.
  const frameH = rig.height * FRAME_MUL;
  setWorldWidth(rig.root, frameH / TEX_SIZE);

  scene.add(rig.root);
  renderer.render(scene, camera);
  scene.remove(rig.root);
  rig.root.rotation.y = 0;
  stats.renders++;

  // Downsample the supersampled render once, into the cached texture.
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const c2 = canvas.getContext("2d");
  c2.drawImage(renderer.domElement, 0, 0, TEX_SIZE, TEX_SIZE);

  const entry = {
    canvas,
    heightM: rig.height,
    // The hand scale dial (loader.js). Kept beside the height rather than
    // folded into it, so `heightM` stays the honest measurement and every
    // consumer applies the artist's intent explicitly.
    renderScale: rig.renderScale ?? 1,
    rowsPerMetre: TEX_SIZE / frameH,
    // With the turnaround on, facing lives in the render (yaw 0 or 180°) and
    // the blit must NOT mirror; with it off, blit-time mirroring owns facing.
    yawed: DIALS.turnaround,
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
