// Every shared drawing a kit names can be found, sized and scaled.
//
// `effect:*`, `summon:*` and `stagefx:*` art belongs to no fighter: the code
// that spawns each one decides how big it is and where it goes. That leaves two
// ways to be quietly wrong, and both had happened:
//
//   1. A drawing nobody spawns looks identical, in the workbench, to one that
//      is in every match. Five were in that state — Reggie's three falling
//      objects and Mechamaru's pigeon orbs — because the usage index walked
//      `sprite` and `aura` but not `key` or `orbSprite`.
//
//   2. A size typed against one of them was stored, displayed, and ignored,
//      because only kit `spriteH` was ever scaled. A control that does nothing
//      is worse than no control.
//
// Both come down to one question — is every shape a kit uses to name its art
// declared in `SPRITE_FIELDS` (src/shared_sprites.js) — so that is what this
// asks, against the real kits. A move that names its drawing under a new field
// fails here rather than in a workbench nobody is looking at.
import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { SPRITE_KEY_FIELDS, SPRITE_LIST_KEY_FIELDS } from "../src/shared_sprites.js";
import { SUMMON_ART } from "../src/config_summons.js";

let failed = 0;
const check = (ok, name, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "   " + detail : ""}`);
  if (!ok) failed += 1;
};

const isShared = (v) => typeof v === "string"
  && (v.startsWith("effect:") || v.startsWith("summon:") || v.startsWith("stagefx:"));

// Every field a kit puts a shared key under, and — where the same node carries
// a height — the field that height sits in.
const named = new Set();
const stray = new Set();
const pairs = new Map();
const seen = new Set();
const HEIGHT_HINTS = ["spriteH", "orbSpriteH", "h"];

// The partner height field for each way of naming a drawing. `null` means the
// renderer decides the size, so there is no kit number to check.
const PARTNER = { sprite: ["spriteH", "h"], orbSprite: ["orbSpriteH"], key: ["h"],
                  aura: [], domainSprite: [],
                  sprites: ["spriteH"], spritePool: ["spriteH"] };

const walk = (node, parentField = null) => {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  // An array is a list of drawings (`sprites: [...]`, `spritePool: [...]`) or a
  // list of pool entries, and its indices are not field names — recurse without
  // reading them as such.
  //
  // The FIELD it hangs off still matters, and this is where the hole was: any
  // array of shared keys used to be waved through as "sprites", so
  // `spritePool` — Geto's four volley curses — looked accounted for while
  // shared_sprites.js walked no such field. Its scale control did nothing and
  // its usage was reported as a summon it is only the stand-in for. An array
  // now has to hang off a field that file actually walks.
  if (Array.isArray(node)) {
    for (const v of node) {
      if (isShared(v)) {
        if (SPRITE_LIST_KEY_FIELDS.includes(parentField)) named.add(`${parentField} → ${v}`);
        else stray.add(`${parentField ?? "an array"} → ${v}`);
      } else if (v && typeof v === "object") walk(v);
    }
    return;
  }
  for (const [field, value] of Object.entries(node)) {
    if (isShared(value)) {
      if (!SPRITE_KEY_FIELDS.includes(field)) {
        stray.add(`${field} → ${value}`);
      } else {
        named.add(`${field} → ${value}`);
        // A height on the same node that is NOT this field's declared partner
        // is a size the fold will miss.
        const partners = PARTNER[field] || [];
        const heights = HEIGHT_HINTS.filter((h) => Number.isFinite(node[h]));
        if (heights.length && partners.length && !heights.some((h) => partners.includes(h))) {
          pairs.set(`${field} beside ${heights.join("/")}`, value);
        }
      }
    }
    if (value && typeof value === "object") walk(value, field);
  }
};
for (const key of CHARACTER_KEYS) {
  walk(CHARACTERS[key]?.specials);
  walk(CHARACTERS[key]?.ultimate);
}

check(named.size > 0, "kits name shared drawings", `${named.size} reference(s)`);
check(stray.size === 0,
  "every one sits under a field src/shared_sprites.js walks",
  stray.size ? [...stray].join(", ") : SPRITE_KEY_FIELDS.join(", "));

// The pairs that matter: a key field beside a height field. Each must be one
// shared_sprites.js knows how to scale, or the size control is inert for it.
check(pairs.size === 0,
  "no drawing sits beside a height its scale would not reach",
  pairs.size ? [...pairs.keys()].join(", ") : "every height is its field's declared partner");

// A creature's size comes from config_summons.js rather than a kit, and the
// scale is read at the draw site — but it still needs a shared key to hang on.
const creatures = Object.entries(SUMMON_ART || {});
const badCreature = creatures.filter(([key, art]) => !key || typeof art !== "object");
check(badCreature.length === 0,
  "every creature in SUMMON_ART is keyed",
  `${creatures.length} creature(s)`);

console.log(failed ? `\n${failed} check(s) failed` : "\nall shared-sprite invariants hold");
process.exit(failed ? 1 : 0);
