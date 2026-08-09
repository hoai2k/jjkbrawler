import { CHARACTER_KEYS, SPRITE_ACTORS } from "./characters.js";
import { applyAllHeightScales } from "./heights.js";
import { STAGES } from "./stages.js";
import { transformActorsFor } from "./config_transform.js";

export const images = new Map();
export let spriteManifest = null;

// Asset URLs are resolved against THIS MODULE rather than the document, so a
// page served from a subdirectory (e.g. /workbench/) loads the same files the
// game does instead of looking for them beside itself.
const ASSET_BASE = new URL("../", import.meta.url);
const assetUrl = (path) => new URL(path, ASSET_BASE).href;

const EFFECT_KEYS = [
  // (rainbow_dragon is NOT here: Geto's dragon is summon:rainbow_dragon, and
  // the effects/ copy was a required fetch nothing ever drew.)
  "blue", "red", "purple", "dismantle", "fuga", "sword_beam", "wind_scythe", "nail",
  "cursed_spirit_orb", "ember", "cursed_bud", "chain", "shutter",
  "lava_geyser", "root_spikes", "scissors_curse", "shrine", "triceratops",
  "uzumaki", "meteor", "tempest", "nail_storm", "scream_wave",
  "cursed_tool", "ratio_wave", "soul_isomer", "speech_word", "drum_burst", "soul_touch",
  "aura_gold", "aura_pink", "aura_violet", "aura_orange", "aura_green",
  "boogie_clap", "domain_gamble",
  // Geto's summoned curses, cut out of his delivered art (tools/recut_curses.py)
  "curse_a", "curse_b", "curse_c", "curse_d", "curse_dragon",
  // Round 7 — Choso, Mei Mei, Uro, Yuji, Reggie, Gakuganji
  "piercing_blood", "blood_orb", "aura_crimson", "crow", "crow_flock",
  "sky_ripple", "sky_shard", "divergent_shock",
  "receipt_blade", "spray_cloud", "drop_vending", "drop_bike", "drop_futon", "sedan",
  "sound_wave", "feedback_wall", "concert_wave", "aura_amber",
];

// Effects for fighters whose art has not been delivered yet, keyed by fighter
// so they are only fetched once that fighter joins CHARACTER_KEYS. These load
// as OPTIONAL: a missing file stays silent instead of logging, and the
// projectile/install renderers fall back to their procedural look, so a
// fighter can ship ahead of their effects (Choso did, for one round).
//
// Empty right now — every effect the roster references is delivered and lives
// in EFFECT_KEYS above, where a broken path IS reported. Populate this again
// when the next fighter is staged.
const STAGED_EFFECT_KEYS = {};

// Stage-hazard polish art (Active Boards — src/stage_fx.js), requested as
// round 9D in docs/asset-requests.md. Optional: every hazard draws a
// procedural canvas fallback, so a missing file changes nothing visible
// except polish.
const STAGE_FX_SPRITES = ["stage_lantern", "stage_fang", "stage_flower", "stage_weak_curse"];

// Domain Expansion backgrounds — a full-screen environment that replaces the
// stage while a domain is open (src/domains.js, drawn by state.domainOverlay).
// Optional: until the art lands the renderer just dims the stage and grades it
// with the domain's colour, which reads fine, so a missing file is not an
// error. Requested as round 9C in docs/asset-requests.md.
const DOMAIN_BACKGROUNDS = {
  unlimited_void: "gojo",
  malevolent_shrine: "sukuna",
  shadow_garden: "megumi",
  self_embodiment: "mahito",
  iron_mountain: "jogo",
  idle_death_gamble: "hakari",
  mutual_love: "yuta",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function getImage(key) {
  return images.get(key) || null;
}

// Sprite art is ~450 MB across 23 fighters, and a match uses at most four of
// them. Rather than hold the title screen hostage to all of it, the loader is
// split three ways:
//
//   loadCoreAssets()      the manifest, and nothing else. ~230 KB, so the menu
//                         is interactive almost immediately. Select-screen
//                         portraits and stage tiles are plain <img> tags the
//                         browser fetches on its own, so the menu needs no
//                         canvas art at all.
//   startBackgroundLoad() shared art (effects, summons, stage backdrops) and
//                         then the roster, one fighter at a time, in the
//                         background while the player is choosing.
//   ensureMatchAssets()   the gate. Whatever this match actually needs and does
//                         not have yet, loaded before the fight begins.
//
// A fighter a player is looking at jumps the queue; one they have committed to
// starts loading immediately, outside the queue. In practice that means the art
// is already in hand by the time they have picked a stage, and the gate below
// resolves without ever showing itself.

// Six at a time is what a browser will open per host anyway; queueing beyond
// that just moves the wait from the network into the browser's own backlog.
const MAX_PARALLEL = 6;

const loadedGroups = new Set();   // group ids fully in memory
const groupLoads = new Map();     // group id -> in-flight promise
const groupStats = new Map();     // group id -> { done, total } files
let queue = [];                   // group ids waiting for the background pump
let pumping = false;
let claims = Promise.resolve();   // fighters a player committed to; the pump defers to these
const listeners = new Set();

function announce() {
  for (const fn of listeners) fn();
}

/** Subscribe to loading progress; returns an unsubscribe function. Fires after
 *  every image and after every completed group. */
export function onLoadProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Background progress for the select-screen hint. Counted in fighters rather
 *  than files because that is the unit the player cares about: a fighter is
 *  either ready to play or is not. */
export function loadProgress() {
  let ready = 0;
  for (const key of CHARACTER_KEYS) if (loadedGroups.has(`char:${key}`)) ready += 1;
  return { charsReady: ready, charsTotal: CHARACTER_KEYS.length };
}

export function isCharacterReady(charKey) {
  return loadedGroups.has(`char:${charKey}`);
}

const imageLoads = new Map(); // key -> in-flight promise

/** Fetch one image, at most once. Two callers wanting the same key — a group
 *  load and a workbench frame request, say — share the single request instead
 *  of racing. Never rejects: a failed optional image is silent, a failed
 *  required one warns, and both leave the key absent from `images`. */
function fetchImage(key, src, optional = false) {
  if (images.has(key)) return Promise.resolve();
  const inFlight = imageLoads.get(key);
  if (inFlight) return inFlight;
  const p = loadImage(src)
    .then((img) => { images.set(key, img); })
    .catch((err) => { if (!optional) console.warn(err.message); })
    .finally(() => imageLoads.delete(key));
  imageLoads.set(key, p);
  return p;
}

async function runJobs(jobs, stats) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await fetchImage(job.key, job.src, job.optional);
      stats.done += 1;
      announce();
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, jobs.length) }, worker));
}

/** Load one group by id, at most once. Safe to call from anywhere, any number
 *  of times: repeat calls join the in-flight load rather than re-fetching. */
function loadGroup(id) {
  if (loadedGroups.has(id)) return Promise.resolve();
  const existing = groupLoads.get(id);
  if (existing) return existing;
  const jobs = groupJobs(id);
  const stats = { done: 0, total: jobs.length };
  groupStats.set(id, stats);
  const p = runJobs(jobs, stats).then(() => {
    loadedGroups.add(id);
    announce();
  });
  groupLoads.set(id, p);
  return p;
}

/** File counts across a set of groups, for a progress bar over a specific
 *  wait (the match gate) rather than over the whole background load. */
function statsFor(ids) {
  let done = 0;
  let total = 0;
  for (const id of ids) {
    const s = groupStats.get(id);
    if (s) { done += s.done; total += s.total; }
  }
  return { done, total };
}

// Alternate art sets. A character can ship a second look (Hanami's round-6
// redesign) that the player opts into in Settings; unlisted frames fall through
// to the default set, so an alternate only needs the frames that differ.
export let spriteSet = "default";

export function setSpriteSet(name) {
  spriteSet = name === "alternate" ? "alternate" : "default";
}

export function hasAlternate(charKey) {
  return !!spriteManifest?.alternates?.[charKey];
}

function altMeta(charKey, frameKey) {
  if (spriteSet !== "alternate") return null;
  return spriteManifest?.alternates?.[charKey]?.[frameKey] || null;
}

/** Whether the `nativeLeft` guess may speak for the drawing a pose is showing.
 *
 *  `nativeLeft` lists frames whose art was DRAWN facing left. It was measured
 *  once, against the art the pose shipped with — so it says nothing about a
 *  second drawing later offered for the same pose, which arrived through an
 *  intake that mirrors everything to face right. Letting it answer for one was
 *  a real bug: selecting an alternate cleared the pose's explicit faceLeft (a
 *  banked field belongs to the drawing that earned it), this guess filled the
 *  hole, and the sprite came up mirrored while the workbench's Mirror box —
 *  which reads the manifest entry, where there is now no value — showed
 *  unmirrored. Ticking the box then wrote the value it already had, so nothing
 *  moved, and only un-ticking it took effect.
 *
 *  So the guess is scoped to the drawing it was made about: the pose's first
 *  option, which is the delivered art. Any other drawing starts with no
 *  judgement, which is the truth, and the Mirror control makes one. */
function nativeLeftApplies(charKey, frameKey, meta) {
  if (!spriteManifest?.nativeLeft?.[charKey]?.includes(frameKey)) return false;
  const options = spriteManifest?.variants?.[charKey]?.[frameKey]?.options;
  if (!options?.length) return true;
  return options[0].file === meta.file;
}

export function frameMeta(charKey, frameKey) {
  const alt = altMeta(charKey, frameKey);
  if (alt) return alt;
  const char = spriteManifest?.characters?.[charKey];
  const meta = char ? char[frameKey] || null : null;
  if (!meta || meta.faceLeft !== undefined) return meta;
  return nativeLeftApplies(charKey, frameKey, meta) ? { ...meta, faceLeft: true } : meta;
}

export function frameImage(charKey, frameKey) {
  if (altMeta(charKey, frameKey)) {
    const img = images.get(`alt:${charKey}:${frameKey}`);
    if (img) return img;
  }
  return images.get(`sprite:${charKey}:${frameKey}`) || null;
}

/** The manifest, and only the manifest. Everything the menu draws is HTML, so
 *  this is the whole of the blocking load. */
export async function loadCoreAssets() {
  const manifestRes = await fetch(assetUrl("assets/sprites/manifest.json"));
  spriteManifest = await manifestRes.json();
  // Sheet art is drawn facing RIGHT by default (verified against every
  // character's run row). `nativeLeft` lists the exceptions that are drawn
  // facing left; the renderer mirrors those instead.
  // A per-frame `faceLeft` is an explicit decision (the sprite workbench's
  // Mirror control writes one), so it wins. `nativeLeft` only fills in frames
  // that have never been judged by hand — otherwise turning a mirror OFF could
  // never stick, because this loop would turn it back on every load.
  for (const [charKey, frames] of Object.entries(spriteManifest.nativeLeft || {})) {
    for (const frameKey of frames) {
      const meta = spriteManifest.characters?.[charKey]?.[frameKey];
      // Same scoping as frameMeta: a pose already pointing at an alternate must
      // not have the delivered drawing's measurement baked onto it.
      if (meta && meta.faceLeft === undefined && nativeLeftApplies(charKey, frameKey, meta)) {
        meta.faceLeft = true;
      }
    }
  }

  // Sizes are solved from canon height against the manifest's body measurements,
  // so this has to happen after the manifest is parsed and before anything is
  // drawn. Doing it here rather than at each call site means the game and both
  // workbenches cannot disagree about how tall a fighter is.
  applyAllHeightScales();
}

// ------------------------------------------------------------- group catalogue

/** Group ids are "char:<key>", "stage:<key>", or "shared". */
function groupJobs(id) {
  const jobs = [];
  const add = (key, src) => jobs.push({ key, src: assetUrl(src) });
  const optional = (key, src) => jobs.push({ key, src: assetUrl(src), optional: true });

  if (id.startsWith("char:")) {
    const charKey = id.slice(5);
    const frames = spriteManifest.characters[charKey] || {};
    for (const [frameKey, meta] of Object.entries(frames)) {
      add(`sprite:${charKey}:${frameKey}`, `assets/sprites/${meta.file}`);
    }
    // A fighter's alternate look travels with them: switching art sets in
    // Settings must never be the thing that triggers a download mid-match.
    for (const [frameKey, meta] of Object.entries(spriteManifest.alternates?.[charKey] || {})) {
      add(`alt:${charKey}:${frameKey}`, `assets/sprites/${meta.file}`);
    }
    return jobs;
  }

  if (id.startsWith("stage:")) {
    const stage = STAGES.find((s) => s.key === id.slice(6));
    if (stage) add(`bg:${stage.key}`, `assets/backgrounds/${stage.bgFile}`);
    return jobs;
  }

  // "shared" — art that belongs to no one fighter and could turn up in any
  // match. Every one of these has a procedural fallback in the renderer, which
  // is why the match gate does not wait on them.
  add("summon:mahoraga", "assets/sprites/summons/mahoraga.png");
  add("summon:rika", "assets/sprites/summons/rika.png");
  add("summon:divineDogWhite", "assets/sprites/summons/divine_dog_white.png");
  add("summon:divineDogBlack", "assets/sprites/summons/divine_dog_black.png");
  add("summon:nue", "assets/sprites/summons/nue.png");
  // Delivered in round 8, so these are required like any other summon — a
  // broken path here should be reported, not swallowed.
  add("summon:rainbow_dragon", "assets/sprites/summons/rainbow_dragon.png");
  add("summon:transfigured_human", "assets/sprites/summons/transfigured_human.png");
  add("summon:inventory_curse", "assets/sprites/summons/inventory_curse.png");

  for (const key of EFFECT_KEYS) add(`effect:${key}`, `assets/sprites/effects/${key}.png`);
  // Round-7 effects load automatically the moment their fighter is promoted
  // into CHARACTER_KEYS — no loader change needed at integration. Optional
  // because a fighter may ship ahead of their effect art (see above).
  for (const charKey of CHARACTER_KEYS) {
    for (const key of STAGED_EFFECT_KEYS[charKey] || []) {
      optional(`effect:${key}`, `assets/sprites/effects/${key}.png`);
    }
  }
  for (const [name, charKey] of Object.entries(DOMAIN_BACKGROUNDS)) {
    if (CHARACTER_KEYS.includes(charKey)) {
      optional(`domain:${name}`, `assets/backgrounds/domains/${name}.jpg`);
    }
  }
  // Props: art a character wears rather than draws — see PROP in characters.js.
  for (const actor of Object.values(SPRITE_ACTORS)) {
    if (actor.prop?.sprite?.startsWith("effect:")) {
      const key = actor.prop.sprite.slice("effect:".length);
      optional(`effect:${key}`, `assets/sprites/effects/${key}.png`);
    }
  }
  for (const key of STAGE_FX_SPRITES) {
    optional(`stagefx:${key}`, `assets/sprites/effects/${key}.png`);
  }
  return jobs;
}

// ------------------------------------------------------------ background pump

/** Every group, awaited. The game never wants this — it is for the sprite
 *  workbench, which browses arbitrary frames of arbitrary fighters and so has
 *  no useful notion of "the ones this match needs". */
export async function loadAllAssets(onProgress) {
  await loadCoreAssets();
  const ids = [
    "shared",
    ...CHARACTER_KEYS.map((k) => `char:${k}`),
    ...STAGES.map((s) => `stage:${s.key}`),
  ];
  const off = onProgress
    ? onLoadProgress(() => {
        const { done, total } = statsFor(ids);
        onProgress(done, total);
      })
    : null;
  try {
    await Promise.all(ids.map(loadGroup));
  } finally {
    off?.();
  }
}

/** Everything the game will eventually want, in the order it wants it. */
export function startBackgroundLoad() {
  if (queue.length || pumping) return;
  queue = ["shared", ...CHARACTER_KEYS.map((k) => `char:${k}`), ...STAGES.map((s) => `stage:${s.key}`)];
  pump();
}

// One group at a time, deliberately. Each fighter is ~30 files, which already
// saturates the connection budget — running several at once would only mean a
// fighter the player just picked has to queue behind three they did not.
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    // Claimed fighters get the pipe to themselves. Without this the background
    // load would keep half the connections while a player waits on the one
    // fighter they actually picked. The group already in flight when a claim
    // arrives still finishes alongside it — one fighter of overlap, not five.
    await claims;
    const id = queue.shift();
    if (loadedGroups.has(id) || groupLoads.has(id)) continue; // taken by a priority request
    await loadGroup(id);
  }
  pumping = false;
}

/** One frame on its own, ahead of the rest of its fighter. The sprite workbench
 *  uses this to put the pose you selected on screen immediately and stream the
 *  rest of the set in behind it; resolves true once the image is usable. */
// `reload` drops the cached image first. The game never needs it — a pose's
// file is fixed for the life of the page — but the workbench can repoint a pose
// at a different drawing, and the cache is keyed by pose, not by file.
export async function loadFrame(charKey, frameKey, { reload = false } = {}) {
  const meta = spriteManifest?.characters?.[charKey]?.[frameKey];
  if (!meta) return false;
  const key = `sprite:${charKey}:${frameKey}`;
  if (reload) images.delete(key);
  await fetchImage(key, assetUrl(`assets/sprites/${meta.file}`));
  return images.has(key);
}

/** Frame keys the manifest lists for a fighter, in manifest order. */
export function frameKeys(charKey) {
  return Object.keys(spriteManifest?.characters?.[charKey] || {});
}

// Built once, lazily: the shared group's key -> job map, so a caller can pull a
// single effect or summon without the whole bundle.
let sharedJobs = null;

/** Every shared sprite key — the `effect:*` and `summon:*` art that belongs to
 *  no single fighter. The sprite workbench lists these under "Other Sprites",
 *  which is the only place they can be reviewed: they are not in the manifest,
 *  so nothing else enumerates them. */
export function sharedSpriteKeys() {
  return groupJobs("shared").map((j) => j.key);
}

/** One `effect:*` / `summon:*` image on its own. The action workbench lists the
 *  effects a move spawns, and needs their thumbnails without downloading every
 *  effect in the game to show two of them. Resolves true if the key is usable. */
export async function loadSharedImage(key) {
  if (!sharedJobs) sharedJobs = new Map(groupJobs("shared").map((j) => [j.key, j]));
  const job = sharedJobs.get(key);
  if (!job) return false;
  await fetchImage(job.key, job.src, job.optional);
  return images.has(key);
}

/** Move a fighter to the head of the background queue: the player is looking at
 *  them, so they are the most likely next pick. */
export function previewCharacter(charKey) {
  const id = `char:${charKey}`;
  const at = queue.indexOf(id);
  if (at > 0) {
    queue.splice(at, 1);
    queue.unshift(id);
  }
}

/** The player has committed to this fighter, so start now rather than waiting
 *  for the pump — this is art the match is definitely going to need. */
export function claimCharacter(charKey) {
  if (!charKey || !spriteManifest?.characters?.[charKey]) return;
  const p = loadGroup(`char:${charKey}`);
  // The pump waits on this, so claims from all four seats are served before the
  // background resumes. Settled, not resolved: a claim that fails must not
  // wedge the queue behind a rejected promise.
  claims = Promise.allSettled([claims, p]).then(() => {});
}

/** Everything this match cannot start without: the fighters actually entering
 *  it, and the stage they are fighting on. Shared art keeps loading in the
 *  background — a summon or effect that has not arrived yet falls back to its
 *  procedural look, whereas a fighter with no frames would be invisible. */
export async function ensureMatchAssets(charKeys, stageKey, onProgress) {
  const ids = matchGroupIds(charKeys, stageKey);
  const off = onProgress
    ? onLoadProgress(() => {
        const { done, total } = statsFor(ids);
        onProgress(done, total);
      })
    : null;
  try {
    // Started together, so the fighters download in parallel rather than one
    // player waiting out the other's art.
    await Promise.all(ids.map(loadGroup));
  } finally {
    off?.();
  }
}

/** True when ensureMatchAssets would actually have to wait, so the caller can
 *  skip putting a loading screen in front of a match that is ready to go. */
export function matchAssetsPending(charKeys, stageKey) {
  return matchGroupIds(charKeys, stageKey).some((id) => !loadedGroups.has(id));
}

function matchGroupIds(charKeys, stageKey) {
  const ids = [...new Set(charKeys.filter(Boolean).map((k) => `char:${k}`))];
  // A fighter who can TRANSFORM needs the actor's art too. It is not optional
  // the way a summon's is: an ultimate that swaps the sprite set for one that
  // was never fetched draws nothing at all, and the fighter vanishes for the
  // duration. Megumi is the only case today (Mahoraga), and it costs one extra
  // set only when he is actually in the match.
  for (const key of charKeys.filter(Boolean)) {
    for (const actor of transformActorsFor(key)) ids.push(`char:${actor}`);
  }
  if (stageKey) ids.push(`stage:${stageKey}`);
  return [...new Set(ids)];
}
