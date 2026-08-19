// Every kind of move that names a drawing is described exactly once.
//
//   node tools/check_spawn_shapes.mjs
//
// WHAT IT IS FOR
//
// A shared drawing is placed by three pieces of code: the handler that paints
// it in a match, the sprite workbench's still viewer, and the workbench's
// action player. `src/config_spawn_shapes.js` is the one table the last two
// read — anchor, mirroring, launch point, and which playback the player uses —
// and this checks that the table and the kits and the playbacks agree.
//
// It exists because the failure it catches is silent by nature. A move type
// with no entry does not throw: the viewer just stops mirroring the drawing,
// the fighter beside it falls back to an idle instead of the pose that throws
// it, the crosshair disappears and the Play button may or may not survive.
// Nothing is red. Somebody notices weeks later that a staff points one way in
// one panel and the other way in the next.
//
// THREE QUESTIONS
//
//   1. does every move type that names a shared drawing have an entry?
//   2. does every entry name a playback the player implements — and does every
//      playback the player implements belong to at least one entry?
//   3. does every entry's `site` name a file that exists, so "go and check the
//      handler" is an instruction rather than a hope?
//
// It reads the kits and the shape table as modules and the playback table by
// text, the same way check_kits.mjs scrapes its handler tables — the playback
// lives in the workbench and imports browser-shaped modules, so it cannot be
// imported here.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { CHARACTERS, CHARACTER_KEYS, STAGED_CHARACTER_KEYS } from "../src/characters.js";
import { SPAWN_SHAPES, PLAYBACKS } from "../src/config_spawn_shapes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYBACK_FILE = join(ROOT, "sprites", "workbench", "preview_playback.js");

const problems = [];

// ---- 1. every type a kit uses, and whether it names a drawing --------------
//
// A type with no drawing needs no entry: a counter, a dash strike and a simple
// domain are all real moves that paint nothing shared.
//
// AN AURA IS NOT ONE EITHER, and Panda's Gorilla Mode is why this is spelled
// out: `modeToggle` names `effect:aura_slate` and nothing else. An install aura
// is placed by drawInstallAura around the fighter's body, the same way for
// every move that hangs one, so it is described by the drawing rather than by
// the move — the registry gives it its own entry (`kind: "aura"`) without ever
// looking at the type. Same for a domain's backdrop, which is cover-fitted to
// the stage. Only art the SPAWN SITE places needs a shape.
const PLACED_BY_TYPE = ["sprite", "spritePool", "sprites", "orbSprite", "key", "drops"];
const named = (node) => {
  let found = false;
  const walk = (n) => {
    if (!n || typeof n !== "object" || found) return;
    for (const [field, value] of Object.entries(n)) {
      if (typeof value === "string") {
        if (PLACED_BY_TYPE.includes(field) && /^(effect|summon):/.test(value)) { found = true; return; }
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            if (PLACED_BY_TYPE.includes(field) && /^(effect|summon):/.test(item)) { found = true; return; }
          } else walk(item);
        }
      } else walk(value);
    }
  };
  walk(node);
  return found;
};

const usedTypes = new Map();       // type -> "who — the move"
for (const key of [...CHARACTER_KEYS, ...STAGED_CHARACTER_KEYS]) {
  const c = CHARACTERS[key];
  if (!c) continue;
  const moves = [...Object.values(c.specials || {}), c.ultimate].filter(Boolean);
  for (const move of moves) {
    if (!move.type || !named(move.p)) continue;
    if (!usedTypes.has(move.type)) usedTypes.set(move.type, `${c.name} — ${move.name}`);
  }
}

for (const [type, who] of usedTypes) {
  if (!SPAWN_SHAPES[type]) {
    problems.push(`${type} (${who}) names a drawing and has no entry in`
      + " src/config_spawn_shapes.js — the viewer will not know how to place it");
  }
}

// ---- 2. the playbacks ------------------------------------------------------
const playback = readFileSync(PLAYBACK_FILE, "utf8");
/** The types each exported playback table implements, scraped by name. Two-space
 *  indent is load-bearing, exactly as in check_kits.mjs. */
function tableKeys(name) {
  const start = playback.indexOf(`export const ${name} = {`);
  if (start < 0) return null;
  let depth = 0;
  let end = start;
  for (let i = playback.indexOf("{", start); i < playback.length; i++) {
    if (playback[i] === "{") depth++;
    else if (playback[i] === "}" && --depth === 0) { end = i; break; }
  }
  return new Set([...playback.slice(start, end).matchAll(/\n {2}(\w+):/g)].map((m) => m[1]));
}

const TABLE_FOR = {
  shot: null,                     // the player's default path, no table
  summon: null,                   // creatures have their own walk
  ultShot: tableKeys("ULT_SHOT"),
  ultDrop: tableKeys("ULT_DROP"),
  flash: tableKeys("FLASH"),
  planted: tableKeys("PLANTED"),
  director: tableKeys("DIRECTOR"),
  worn: tableKeys("WORN"),
  drop: new Set([...playback.matchAll(/DROP_MOVES = new Set\(\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]))),
};

for (const [name, keys] of Object.entries(TABLE_FOR)) {
  if (keys === null) continue;
  if (!keys || !keys.size) problems.push(`the "${name}" playback table is missing from ${PLAYBACK_FILE}`);
}

const claimed = new Map();         // playback -> types that asked for it
for (const [type, shape] of Object.entries(SPAWN_SHAPES)) {
  if (!shape.play) continue;       // no preview for this one, and that is allowed
  if (!PLAYBACKS.includes(shape.play)) {
    problems.push(`${type}: play "${shape.play}" is not one of ${PLAYBACKS.join(", ")}`);
    continue;
  }
  claimed.set(shape.play, [...(claimed.get(shape.play) || []), type]);
  const keys = TABLE_FOR[shape.play];
  // `worn` is keyed by what the drawing IS (an aura, a rampage body) rather
  // than by the move type, so its entries cannot be matched name for name.
  if (keys && shape.play !== "worn" && !keys.has(type)) {
    problems.push(`${type}: play "${shape.play}" but there is no ${type} entry in that`
      + " table in sprites/workbench/preview_playback.js — the drawing will have no action");
  }
}

for (const [name, keys] of Object.entries(TABLE_FOR)) {
  if (!keys || name === "worn") continue;
  for (const type of keys) {
    if (SPAWN_SHAPES[type]?.play === name) continue;
    problems.push(`${type} is implemented as a "${name}" playback and no entry in`
      + ` src/config_spawn_shapes.js asks for it — the player would never reach it`);
  }
}

// ---- 3. every entry points at a real file ----------------------------------
for (const [type, shape] of Object.entries(SPAWN_SHAPES)) {
  const path = /\(([^)]+\.js)\)/.exec(shape.site || "")?.[1] || (shape.site || "").trim();
  if (!path || !path.endsWith(".js")) continue;
  if (!existsSync(join(ROOT, path))) {
    problems.push(`${type}: site names ${path}, which is not there`);
  }
}

if (problems.length) {
  for (const line of problems) console.error(`  FAIL ${line}`);
  console.error(`\n${problems.length} problem(s) with the spawn-shape table.`);
  process.exit(1);
}

const withPlay = Object.values(SPAWN_SHAPES).filter((s) => s.play).length;
console.log(`spawn shapes ok — ${usedTypes.size} move type(s) name a drawing,`
  + ` ${Object.keys(SPAWN_SHAPES).length} described, ${withPlay} with a playback`);
