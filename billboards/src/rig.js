// The rig registry: which characters have a 3D body, and which clip answers
// each animation state.
//
// Loading happens once, when the billboard backend is selected (billboard.js
// calls initRigs). Three sources feed the registry:
//
//   * billboards/assets/manifest.json — delivered rigs that passed intake and
//     were APPROVED. The manifest is fetched no-cache for the same reason the
//     sprite manifest is: it is an index, and a stale index 404s its way to
//     invisible fighters.
//   * the mannequin — registered for the characters `?mannequin=` names
//     (`all` for everyone). The B0 proof body; never registered by default.
//   * the default pose set — the mannequin's clips, which back every rig.
//
// CLIP RESOLUTION — the inheritance the workbench edits. For character C in
// state S, the first answer wins:
//
//   1. manifest characters[C].clips[S].from  a hand-set override: "draw this
//      state with character X's clip" (or "default"). Deliberately beats C's
//      own clip — it is how the workbench retires a bad delivered clip
//      without deleting it from the file.
//   2. C's own rig clip named S.
//   3. manifest characters[C].inheritClips   whole-set fallback onto another
//      character (their own clips only — chains do not recurse, so two
//      characters pointing at each other cannot loop).
//   4. the default pose set.
//
// Cross-character inheritance works because clips bind by BONE NAME and every
// rig honours the standard skeleton naming (delivery spec) — a clip is not
// tied to the rig it arrived in. This is the manifest mirror of how a sprite
// fighter's `anims` block overrides SEMANTIC_ANIMS.

import { clipNameFor } from "./states.js";
import { buildMannequin, buildDefaultClips, MANNEQUIN_HEIGHT_M } from "./mannequin.js";

/** charKey -> { root, height, clips: Map, mixer, actions: Map, entry } */
const RIGS = new Map();
let DEFAULT_CLIPS = null;
let MANIFEST = { characters: {} };
let THREE = null;

const BASE = new URL("../", import.meta.url); // billboards/

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
 *  above, and where it came from — the workbench shows the `source` so an
 *  inherited pose is labelled as inherited rather than passing as the rig's
 *  own. Returns null only when even the default set lacks the state. */
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
    // A hand-set override naming a clip that is not loaded falls through
    // rather than failing: the next answer is still a drawable pose.
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

// -------------------------------------------------------------------- setup

function registerRig(charKey, { root, height, clips }, entry = null) {
  const mixer = new THREE.AnimationMixer(root);
  RIGS.set(charKey, { root, height, clips, mixer, actions: new Map(), entry });
}

async function loadGlbRig(charKey, entry, GLTFLoader) {
  const url = new URL(`assets/${entry.model}`, BASE).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  registerRig(charKey, {
    root: gltf.scene,
    height: entry.heightM || MANNEQUIN_HEIGHT_M,
    clips,
  }, entry);
}

/** Load the manifest, the approved rigs, and any mannequin stand-ins.
 *
 *  `mannequinFor` comes from the URL (billboard.js parses it): a list of
 *  character keys, or ["all"]. A mannequin never displaces a real rig — a
 *  delivered fighter stays delivered even under `mannequin=all`, so the flag
 *  is safe to leave in a bookmarked test URL as the roster fills in. */
export async function initRigs(three, GLTFLoader, mannequinFor = [], allCharKeys = []) {
  THREE = three;
  DEFAULT_CLIPS = buildDefaultClips(THREE);

  try {
    const res = await fetch(new URL("assets/manifest.json", BASE).href, { cache: "no-cache" });
    MANIFEST = await res.json();
  } catch (err) {
    console.warn(`billboards: manifest failed to load (${err.message}) — no delivered rigs will register.`);
    MANIFEST = { characters: {} };
  }

  const loads = [];
  for (const [charKey, entry] of Object.entries(MANIFEST.characters || {})) {
    if (!entry?.approved || !entry.model) continue;
    loads.push(loadGlbRig(charKey, entry, GLTFLoader).catch((err) => {
      // One broken rig must not take the backend down — that character simply
      // stays a sprite, and the console says why they did.
      console.warn(`billboards: rig for "${charKey}" failed to load — drawing their sprites instead. ${err.message}`);
    }));
  }
  await Promise.all(loads);

  const wantAll = mannequinFor.includes("all");
  const keys = wantAll ? allCharKeys : mannequinFor;
  for (const charKey of keys) {
    if (RIGS.has(charKey)) continue;
    // The mannequin's clip set IS the default pose set, so its rig registers
    // with no own clips — resolution falls through to "default" and the
    // workbench labels the pose as the stand-in it is, not as delivered work.
    const m = buildMannequin(THREE, charKey);
    registerRig(charKey, { root: m.root, height: m.height, clips: new Map() },
      MANIFEST.characters?.[charKey] || null);
  }
}
