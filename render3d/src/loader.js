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
//
// ALL-OR-NOTHING per fighter: only `approved: true` manifest entries
// register, exactly like billboards — art is in the repo before it is in the
// game, and what players see is what was reviewed.

import { clipNameFor } from "../../billboards/src/states.js";
import { buildMannequin, buildDefaultClips, MANNEQUIN_HEIGHT_M } from "../../billboards/src/mannequin.js";
import { clone as cloneSkinned } from "../../vendor/three/utils/SkeletonUtils.js";
import { applyToonMaterials } from "./toon.js";
import { addOutlines } from "./outline.js";
import { captureCleanPose } from "./pose.js";

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

  const override = entry?.clips?.[name]?.from;
  if (override) {
    const clip = override === "default"
      ? DEFAULT_CLIPS?.get(name)
      : RIGS.get(override)?.clips?.get(name);
    if (clip) return { clip, source: override === "default" ? "default" : `from:${override}` };
  }

  if (own?.clips?.has(name)) return { clip: own.clips.get(name), source: "own" };

  const inherit = entry?.inheritClips;
  if (inherit && inherit !== "default") {
    const clip = RIGS.get(inherit)?.clips?.get(name);
    if (clip) return { clip, source: `inherit:${inherit}` };
  }

  const fallback = DEFAULT_CLIPS?.get(name);
  return fallback ? { clip: fallback, source: "default" } : null;
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

// -------------------------------------------------------------------- setup

function registerRig(charKey, { root, height, clips }, entry = null) {
  const mixer = new THREE.AnimationMixer(root);
  // The bind pose, taken here because here is the last moment it is certainly
  // the bind pose — every pose from now on starts by restoring it (pose.js).
  captureCleanPose(root);
  RIGS.set(charKey, { root, height, clips, mixer, actions: new Map(), entry });
}

async function loadGlbRig(charKey, entry, GLTFLoader) {
  const url = new URL(`assets/${entry.model}`, BASE).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  // The anime pass: every delivered material becomes a toon material (with
  // the manifest's per-character `toon` overrides and the .glb's own extras
  // applied), and every mesh grows its ink shell.
  applyToonMaterials(THREE, gltf.scene, entry.toon || {});
  addOutlines(THREE, gltf.scene);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  registerRig(charKey, {
    root: gltf.scene,
    height: entry.heightM || MANNEQUIN_HEIGHT_M,
    clips,
  }, entry);
}

/** Load the manifest, the approved rigs, and any mannequin stand-ins —
 *  `mannequinFor` from the URL (`?mannequin=all` or a key list), never
 *  displacing a delivered rig. */
export async function initRigs(three, GLTFLoader, mannequinFor = [], allCharKeys = []) {
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
  for (const [charKey, entry] of Object.entries(MANIFEST.characters || {})) {
    if (!entry?.approved || !entry.model) continue;
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
    registerRig(charKey, { root: m.root, height: m.height, clips: new Map() },
      MANIFEST.characters?.[charKey] || null);
  }
}
