import { CHARACTER_KEYS } from "./characters.js";
import { STAGES } from "./stages.js";

export const images = new Map();
export let spriteManifest = null;

// Asset URLs are resolved against THIS MODULE rather than the document, so a
// page served from a subdirectory (e.g. /workbench/) loads the same files the
// game does instead of looking for them beside itself.
const ASSET_BASE = new URL("../", import.meta.url);
const assetUrl = (path) => new URL(path, ASSET_BASE).href;

const EFFECT_KEYS = [
  "blue", "red", "purple", "dismantle", "fuga", "sword_beam", "wind_scythe", "nail",
  "rainbow_dragon", "cursed_spirit_orb", "ember", "cursed_bud", "chain", "shutter",
  "lava_geyser", "root_spikes", "scissors_curse", "shrine", "triceratops",
  "uzumaki", "meteor", "tempest", "nail_storm", "scream_wave",
  "cursed_tool", "ratio_wave", "soul_isomer", "speech_word", "drum_burst", "soul_touch",
  "aura_gold", "aura_pink", "aura_violet", "aura_orange", "aura_green",
  "boogie_clap", "domain_gamble",
  // Geto's summoned curses, lifted out of his round-6 art (tools/extract_curses.py)
  "curse_a", "curse_b", "curse_c", "curse_d", "curse_dragon",
  // Round 7, delivered: Choso, Mei Mei, Uro
  "piercing_blood", "blood_orb", "aura_crimson", "crow", "crow_flock",
  "sky_ripple", "sky_shard",
];

// Effects for fighters still awaiting art, keyed by fighter so they are only
// fetched once that fighter joins CHARACTER_KEYS.
//
// A fighter can ship before their effect art does — Choso did, for one round —
// so these load as OPTIONAL: a missing file stays silent instead of logging,
// and the projectile/install renderers fall back to their procedural look.
// Move a fighter's keys into EFFECT_KEYS once the art is delivered AND the
// fighter is on the roster, so a genuinely broken path is still reported.
//
// `divergent_shock` is already delivered but stays here because Yuji himself
// has not shipped; it promotes with him.
const STAGED_EFFECT_KEYS = {
  yuji: ["divergent_shock"],
  reggie: ["receipt_blade", "spray_cloud", "drop_vending", "drop_bike", "drop_futon", "sedan"],
  gakuganji: ["sound_wave", "feedback_wall", "concert_wave", "aura_amber"],
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

export function frameMeta(charKey, frameKey) {
  const alt = altMeta(charKey, frameKey);
  if (alt) return alt;
  const char = spriteManifest?.characters?.[charKey];
  const meta = char ? char[frameKey] || null : null;
  if (!meta || meta.faceLeft !== undefined) return meta;
  const nativeLeft = spriteManifest?.nativeLeft?.[charKey];
  return nativeLeft?.includes(frameKey) ? { ...meta, faceLeft: true } : meta;
}

export function frameImage(charKey, frameKey) {
  if (altMeta(charKey, frameKey)) {
    const img = images.get(`alt:${charKey}:${frameKey}`);
    if (img) return img;
  }
  return images.get(`sprite:${charKey}:${frameKey}`) || null;
}

export async function loadAssets(onProgress) {
  const manifestRes = await fetch(assetUrl("assets/sprites/manifest.json"));
  spriteManifest = await manifestRes.json();
  // Sheet art is drawn facing RIGHT by default (verified against every
  // character's run row). `nativeLeft` lists the exceptions that are drawn
  // facing left; the renderer mirrors those instead.
  for (const [charKey, frames] of Object.entries(spriteManifest.nativeLeft || {})) {
    for (const frameKey of frames) {
      const meta = spriteManifest.characters?.[charKey]?.[frameKey];
      if (meta) meta.faceLeft = true;
    }
  }

  const jobs = [];
  const add = (key, src) => jobs.push({ key, src: assetUrl(src) });

  for (const charKey of CHARACTER_KEYS) {
    const frames = spriteManifest.characters[charKey] || {};
    for (const [frameKey, meta] of Object.entries(frames)) {
      add(`sprite:${charKey}:${frameKey}`, `assets/sprites/${meta.file}`);
    }
  }
  for (const stage of STAGES) {
    add(`bg:${stage.key}`, `assets/backgrounds/${stage.bgFile}`);
  }
  add("summon:mahoraga", "assets/sprites/summons/mahoraga.png");
  add("summon:rika", "assets/sprites/summons/rika.png");
  add("summon:divineDogWhite", "assets/sprites/summons/divine_dog_white.png");
  add("summon:divineDogBlack", "assets/sprites/summons/divine_dog_black.png");
  add("summon:nue", "assets/sprites/summons/nue.png");
  // Dedicated art for these is requested but not delivered yet
  // (docs/asset-requests.md, round 7). The summon system falls back to
  // placeholder effect sprites until the files exist, so these load quietly.
  const optional = (key, src) => jobs.push({ key, src: assetUrl(src), optional: true });
  optional("summon:rainbow_dragon", "assets/sprites/summons/rainbow_dragon.png");
  optional("summon:transfigured_human", "assets/sprites/summons/transfigured_human.png");
  optional("summon:inventory_curse", "assets/sprites/summons/inventory_curse.png");
  for (const [charKey, frames] of Object.entries(spriteManifest.alternates || {})) {
    for (const [frameKey, meta] of Object.entries(frames)) {
      add(`alt:${charKey}:${frameKey}`, `assets/sprites/${meta.file}`);
    }
  }

  for (const key of EFFECT_KEYS) add(`effect:${key}`, `assets/sprites/effects/${key}.png`);
  // Round-7 effects load automatically the moment their fighter is promoted
  // into CHARACTER_KEYS — no loader change needed at integration. Optional
  // because a fighter may ship ahead of their effect art (see above).
  for (const charKey of CHARACTER_KEYS) {
    for (const key of STAGED_EFFECT_KEYS[charKey] || []) {
      optional(`effect:${key}`, `assets/sprites/effects/${key}.png`);
    }
  }

  let done = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const img = await loadImage(job.src);
        images.set(job.key, img);
      } catch (err) {
        if (!job.optional) console.warn(err.message);
      }
      done += 1;
      if (onProgress) onProgress(done, jobs.length);
    })
  );
}
