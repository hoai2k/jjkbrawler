// The render3d rig registry: which characters have a 3D body, which clip
// answers each animation state — and the conversion every body goes through
// on the way in (toon materials + ink outlines), so nothing downstream ever
// meets a raw PBR material.
//
// Deliberately the same shape as billboards/src/rig.js, because the two
// backends share one asset truth: the same delivery spec, the same standard
// skeleton, the same clip names — a rig approved for billboards is a valid
// intake candidate here the day it lands (render3d/docs/asset-requests.md).
// What differs is the registry itself (each backend loads its own manifest
// from its own assets/) and the intake conversion above.
//
// CLIP RESOLUTION — identical inheritance to billboards, edited in the
// render3d workbench. For character C in state S, first answer wins:
//   1. manifest characters[C].clips[S].from   (hand-set override)
//   2. C's own rig clip named S
//   3. manifest characters[C].inheritClips    (whole-set fallback, no chains)
//   4. the default pose set (the mannequin's clips)
// ...then characters[C].clips[S].mirror / characters[C].mirrorClips may flip
// the answer left-right (see finishClip below).
//
// ALL-OR-NOTHING per fighter: only `approved: true` manifest entries
// register, exactly like billboards — art is in the repo before it is in the
// game, and what players see is what was reviewed.

import { clipNameFor } from "../../billboards/src/states.js";
import { mirrorClip } from "../../billboards/src/clips.js";
import { buildMannequin, buildDefaultClips, MANNEQUIN_HEIGHT_M } from "../../billboards/src/mannequin.js";
import { clone as cloneSkinned } from "../../vendor/three/utils/SkeletonUtils.js";
import { applyToonMaterials, characterToon } from "./toon.js";
import { addOutlines, setOutlineFor } from "./outline.js";
import { captureCleanPose, poseRig } from "./pose.js";

/** charKey -> { root, height, clips: Map, mixer, actions: Map, entry } */
const RIGS = new Map();
let DEFAULT_CLIPS = null;
let MANIFEST = { characters: {} };
let THREE = null;

const BASE = new URL("../", import.meta.url); // render3d/

export function hasRig(charKey) {
  return RIGS.has(charKey);
}

export function getRig(charKey) {
  return RIGS.get(charKey) || null;
}

export function rigCount() {
  return RIGS.size;
}

export function defaultClips() {
  return DEFAULT_CLIPS;
}

export function rigManifest() {
  return MANIFEST;
}

/** The clip character `charKey` plays for `state`, per the resolution order
 *  above, with its provenance (`source`) for the workbench. */
export function resolveClip(charKey, state) {
  const name = clipNameFor(state);
  const entry = MANIFEST.characters?.[charKey];
  const own = RIGS.get(charKey);
  const answer = (clip, source) => finishClip(clip, source, name, entry);

  const override = entry?.clips?.[name]?.from;
  if (override) {
    const clip = override === "default"
      ? DEFAULT_CLIPS?.get(name)
      : RIGS.get(override)?.clips?.get(name);
    if (clip) return answer(clip, override === "default" ? "default" : `from:${override}`);
  }

  if (own?.clips?.has(name)) return answer(own.clips.get(name), "own");

  const inherit = entry?.inheritClips;
  if (inherit && inherit !== "default") {
    const clip = RIGS.get(inherit)?.clips?.get(name);
    if (clip) return answer(clip, `inherit:${inherit}`);
  }

  const fallback = DEFAULT_CLIPS?.get(name);
  return fallback ? answer(fallback, "default") : null;
}

// Mirrored clips — identical to billboards/src/rig.js, same manifest keys:
// `characters[C].clips[S].mirror` flips one state's resolved clip left-right,
// `characters[C].mirrorClips` flips the whole set (a per-state `mirror` then
// exempts a clip). This is POSE data changing hands, not facing: the
// turnaround still yaws the rig, and a mirrored punch extends exactly as far
// forward with the other fist (clips.js mirrorClip), so a flipped model keeps
// every state's read. Built lazily, cached per source clip.
const MIRRORED = new WeakMap();

function finishClip(clip, source, name, entry) {
  const flip = !!entry?.mirrorClips !== !!entry?.clips?.[name]?.mirror;
  if (!flip || !THREE) return { clip, source };
  let m = MIRRORED.get(clip);
  if (!m) {
    m = mirrorClip(THREE, clip);
    MIRRORED.set(clip, m);
  }
  return { clip: m, source: `${source}+mirror` };
}

// ---------------------------------------------------------------- instances
//
// The registry holds ONE rig object per character, which is all the flat path
// needs: it poses that object, renders it to a texture, and moves on, so two
// Gojos on screen simply take turns. A caller that puts rigs in a LIVE scene
// (the 2.5D camera) cannot do that — the same Object3D cannot stand in two
// places at once, and posing it for one fighter would visibly re-pose the
// other.
//
// So that caller asks for an INSTANCE: a skeleton-aware clone with its own
// mixer, cached per instance id (the fighter's id). Clips are shared — they
// are read-only keyframe data and bind by bone name — so an instance costs a
// cloned scene graph and nothing else.

/** instanceId -> { charKey, root, height, clips, mixer, actions } */
const INSTANCES = new Map();

/** A private posable copy of `charKey`'s rig for `instanceId`. Returns null
 *  when the character has no rig. Repeat calls return the same instance. */
export function acquireInstance(charKey, instanceId) {
  const key = `${charKey}#${instanceId}`;
  const held = INSTANCES.get(key);
  if (held) return held;
  const base = RIGS.get(charKey);
  if (!base) return null;
  // cloneSkinned rebinds SkinnedMesh skeletons onto the cloned bones; a plain
  // Object3D.clone() would leave every copy driven by the original's skeleton.
  const root = cloneSkinned(base.root);
  // The clone copies the base's CURRENT transforms, which may be mid-pose, so
  // it takes the base's remembered bind pose rather than its own.
  captureCleanPose(root, base.root);
  const inst = {
    charKey, root, height: base.height, clips: base.clips,
    renderScale: base.renderScale ?? 1, yawOffset: base.yawOffset ?? 0,
    mixer: new THREE.AnimationMixer(root), actions: new Map(),
  };
  INSTANCES.set(key, inst);
  return inst;
}

/** Drop instances whose id is not in `live` — fighters that left the match. */
export function releaseInstancesExcept(live) {
  for (const [key, inst] of INSTANCES) {
    if (live.has(key)) continue;
    inst.mixer.stopAllAction();
    inst.root.removeFromParent();
    INSTANCES.delete(key);
  }
}

// ---------------------------------------------------- size and orientation
//
// Two per-character facts about a DELIVERY that no clip and no engine layer
// can be responsible for, both edited in the workbench and both stored in the
// manifest:
//
//   renderScale  How big to draw this rig, as a multiplier on the character's
//                head-height target. It exists because "how tall the character
//                is" and "how tall the model measures" are different numbers:
//                a model in its idle pose is shorter than the person (nobody
//                idles at full stretch, and a stance with the legs apart drops
//                the hips), while the top of the art is hair, not skull. The
//                dial is deliberately a HAND setting rather than a measurement
//                — the measurement is offered below as a reading, because
//                which of those effects should be corrected for is a judgement
//                about how the fighter should read next to their sprite, not
//                an arithmetic fact.
//
//   yawOffsetDeg Which way the rig faces. The delivery spec says forward is
//                +Z; a model that arrives built the other way round faces
//                backwards in every state, and there is nothing to fix in the
//                clips — the whole rig is turned. 180 is the common case.
//
// Both default to "as delivered" (1 and 0), so a rig that honours the spec
// needs neither.

/** Read the manifest's size/orientation/look settings onto a rig entry. */
function applyEntrySettings(rig, entry) {
  // Line weight is per character where the manifest says so (the toon block's
  // one non-material knob); the ramp knobs in that block were already applied
  // when the materials were built.
  setOutlineFor(rig.root, entry?.toon?.outlinePx ?? null);
  const scale = Number(entry?.renderScale);
  rig.renderScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const yaw = Number(entry?.yawOffsetDeg);
  rig.yawOffsetDeg = Number.isFinite(yaw) ? yaw : 0;
  rig.yawOffset = (rig.yawOffsetDeg * Math.PI) / 180;
}

/** Set them live, from the workbench. */
export function setRigSettings(charKey, { renderScale, yawOffsetDeg } = {}) {
  const rig = RIGS.get(charKey);
  if (!rig) return null;
  if (renderScale !== undefined && Number.isFinite(renderScale) && renderScale > 0) {
    rig.renderScale = renderScale;
  }
  if (yawOffsetDeg !== undefined && Number.isFinite(yawOffsetDeg)) {
    rig.yawOffsetDeg = yawOffsetDeg;
    rig.yawOffset = (yawOffsetDeg * Math.PI) / 180;
  }
  // Instances already handed out share the character's settings.
  for (const inst of INSTANCES.values()) {
    if (inst.charKey !== charKey) continue;
    inst.renderScale = rig.renderScale;
    inst.yawOffset = rig.yawOffset;
  }
  return rig;
}

/** Meshes that count as the body. A raised spear, a swinging braid and the
 *  ink outline shells are all excluded: none of them is how tall someone is. */
function bodyMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    for (let p = o; p; p = p.parent) {
      if (/^(Prop_|Chain_)/.test(p.name || "")) return;
    }
    out.push(o);
  });
  return out;
}

/**
 * Measure `rigEntry` posed at the start of its idle, foot line to top of head,
 * in metres. `clip` overrides the resolved idle clip, which is how the
 * workbench re-measures while an idle pose is being edited.
 *
 * Returns null when there is nothing measurable, and the caller keeps the
 * declared height.
 */
export function measureIdleHeight(charKey, rigEntry = null, clip = null) {
  const rig = rigEntry || RIGS.get(charKey);
  if (!rig) return null;
  const idle = clip || resolveClip(charKey, "idle")?.clip;
  if (!idle) return null;
  poseRig(rig, "idle", 0, idle, {});
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let any = false;
  for (const mesh of bodyMeshes(rig.root)) {
    // `precise` runs the vertices through their bone transforms, so this is
    // the POSED silhouette and not the bind pose's bounding box.
    box.expandByObject(mesh, true);
    any = true;
  }
  if (!any || !Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) return null;
  const h = box.max.y - box.min.y;
  return h > 0.2 ? h : null;
}

/** What the scale dial would have to be for the model to stand exactly its
 *  head-height target — offered to the workbench as a READING next to the dial,
 *  never applied on its own. `clip` lets the workbench measure an idle it is
 *  in the middle of editing. */
export function suggestedScale(charKey, clip = null) {
  const rig = RIGS.get(charKey);
  if (!rig) return null;
  const measured = measureIdleHeight(charKey, rig, clip);
  if (!measured) return null;
  return { measured, declared: rig.declaredHeight ?? rig.height,
           scale: (rig.declaredHeight ?? rig.height) / measured };
}

// -------------------------------------------------------------------- setup

function registerRig(charKey, { root, height, clips, isMannequin = false }, entry = null) {
  const mixer = new THREE.AnimationMixer(root);
  // The bind pose, taken here because here is the last moment it is certainly
  // the bind pose — every pose from now on starts by restoring it (pose.js).
  captureCleanPose(root);
  // `declaredHeight` is what the manifest says the character is; `height` is
  // what the model measures in its idle pose, filled in by calibrateHeight
  // once every rig is registered (the measurement needs the clip set).
  const rig = { root, height, declaredHeight: height, clips, mixer,
                actions: new Map(), entry, isMannequin };
  applyEntrySettings(rig, entry);
  RIGS.set(charKey, rig);
}

async function loadGlbRig(charKey, entry, GLTFLoader) {
  const url = new URL(`assets/${entry.model}`, BASE).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  // The anime pass: every delivered material becomes a toon material (with
  // the manifest's per-character `toon` overrides and the .glb's own extras
  // applied), and every mesh grows its ink shell.
  applyToonMaterials(THREE, gltf.scene, characterToon(entry));
  addOutlines(THREE, gltf.scene);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  registerRig(charKey, {
    root: gltf.scene,
    height: entry.heightM || MANNEQUIN_HEIGHT_M,
    clips,
  }, entry);
}

/** Load one delivered rig on demand, if it is not already in.
 *
 *  Twenty-seven models is 56 MB of glTF and twenty-seven textures to decode,
 *  and asking for all of it up front is what made the workbench unusable on a
 *  phone: iOS Safari runs out of memory partway through, the module's
 *  top-level await never settles, and NOTHING after it runs — so every button
 *  on a fully rendered page silently does nothing. The game still loads the
 *  roster eagerly (a match needs whoever is in it, immediately), but a tool
 *  that looks at one fighter at a time should pay for one fighter at a time.
 *
 *  Resolves to true when the character has a rig afterwards, however it got
 *  one; concurrent calls for the same character share a single load. */
const inFlight = new Map();
export async function ensureRig(charKey, GLTFLoader) {
  const entry = MANIFEST?.characters?.[charKey];
  if (!entry?.approved || !entry.model) return RIGS.has(charKey);
  const existing = RIGS.get(charKey);
  if (existing && !existing.isMannequin) return true;
  if (!inFlight.has(charKey)) {
    inFlight.set(charKey, loadGlbRig(charKey, entry, GLTFLoader)
      .catch((err) => {
        console.warn(`render3d: rig for "${charKey}" failed to load (${err.message})`);
      })
      .finally(() => inFlight.delete(charKey)));
  }
  await inFlight.get(charKey);
  return RIGS.has(charKey);
}

/** Load the manifest, the approved rigs, and any mannequin stand-ins —
 *  `mannequinFor` from the URL (`?mannequin=all` or a key list), never
 *  displacing a delivered rig.
 *
 *  `eager` limits WHICH delivered rigs are fetched now: a list of keys loads
 *  only those and leaves the rest to `ensureRig`. Omitted means all of them,
 *  which is what a match wants. */
export async function initRigs(three, GLTFLoader, mannequinFor = [], allCharKeys = [], eager = null) {
  THREE = three;
  DEFAULT_CLIPS = buildDefaultClips(THREE);

  try {
    const res = await fetch(new URL("assets/manifest.json", BASE).href, { cache: "no-cache" });
    MANIFEST = await res.json();
  } catch (err) {
    console.warn(`render3d: manifest failed to load (${err.message}) — no delivered rigs will register.`);
    MANIFEST = { characters: {} };
  }

  const loads = [];
  const wanted = eager ? new Set(eager) : null;
  for (const [charKey, entry] of Object.entries(MANIFEST.characters || {})) {
    if (!entry?.approved || !entry.model) continue;
    if (wanted && !wanted.has(charKey)) continue;
    loads.push(loadGlbRig(charKey, entry, GLTFLoader).catch((err) => {
      console.warn(`render3d: rig for "${charKey}" failed to load — drawing their sprites instead. ${err.message}`);
    }));
  }
  await Promise.all(loads);

  const wantAll = mannequinFor.includes("all");
  const keys = wantAll ? allCharKeys : mannequinFor;
  for (const charKey of keys) {
    if (RIGS.has(charKey)) continue;
    const m = buildMannequin(THREE, charKey);
    // The proof body goes through the same anime pass as a delivery: a grey
    // toon-ramped, ink-outlined mannequin is the look-dev canvas D1 needs
    // before any character exists.
    applyToonMaterials(THREE, m.root);
    addOutlines(THREE, m.root);
    // Flagged, so a later ensureRig() knows a stand-in is still standing in
    // and goes and fetches the real delivery.
    registerRig(charKey, { root: m.root, height: m.height, clips: new Map(),
      isMannequin: true },
      MANIFEST.characters?.[charKey] || null);
  }

}
