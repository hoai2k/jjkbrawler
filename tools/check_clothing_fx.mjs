// THE DRIFT GUARD for Clothing FX (src/clothing_fx.js).
//
//     node tools/check_clothing_fx.mjs            # in `npm run check`
//     node tools/check_clothing_fx.mjs --verbose
//     node tools/check_clothing_fx.mjs --bless    # after LOOKING at the sheet
//
// The effect finds a character's garments by COLOUR, tuned against the art as
// it is drawn today. Nothing about that is enforced by the art pipeline: a
// re-export that shifts her cloud a few degrees toward blue, a redraw that
// gives her a cyan accessory, a new pose drawn in a different outfit — each
// changes what the key takes, and none of them would otherwise fail anything.
// The failure mode is not subtle when you look at it (in an early build the key
// took her forearm off at the wrist) and invisible when you do not, because the
// setting is off by default and only one character has a profile.
//
// So the key is pinned to the art it was verified against. `clothing_fx.json`
// beside the sprite manifest records, per frame, the hash of the drawing and
// what the key took out of it; this runs the real `garmentMask` over the
// shipped art and compares. That splits the two ways it can go wrong, which
// otherwise look identical from the outside:
//
//   THE ART MOVED      the drawing's hash changed. The key may be fine or may
//                      now be eating an arm. Nobody can tell from here — look
//                      at the frame, then bless it.
//   THE KEY MOVED      same drawing, different result. Somebody edited the
//                      profile in clothing_fx.js, and this is every frame that
//                      changed under it.
//
// Blessing is deliberate and it is a diff in the repo, which is the point: the
// numbers a person looked at are the numbers in the commit.
//
// Pure node — tools/png.mjs reads the pixels — so this costs a few seconds and
// needs neither browser nor server. The end-to-end pass (the settings screen,
// the real draw path) is tools/smoke_clothing_fx.mjs.

import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPng } from "./png.mjs";
import { GARMENTS, garmentMask } from "../src/clothing_fx.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRITES = path.join(ROOT, "sprites/assets");
const BASELINE = path.join(SPRITES, "clothing_fx.json");

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const BLESS = argv.includes("--bless");
const ONLY = argv.includes("--char") ? argv[argv.indexOf("--char") + 1] : null;

// How far a measurement may move on UNCHANGED art before it is called a
// change. Not zero: the mask is computed in floating point off a subsampled
// grid, and a rounding difference between engines should not fail a build. Far
// tighter than the difference any real edit to the profile makes.
const TOL = { share: 0.002, band: 0.01 };

// A floor and a ceiling that hold regardless of what was blessed — the catch
// for a baseline blessed on something nobody actually looked at.
const SANE = { minShare: 0.002, maxShare: 0.40 };

const manifest = JSON.parse(readFileSync(path.join(SPRITES, "manifest.json"), "utf8"));

let failures = 0;
const fail = (label, detail) => {
  failures++;
  console.log(`FAIL ${label}\n       ${detail}`);
};

const hashOf = (file) => createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 12);

/** What the key does to one frame, as the four numbers worth pinning. */
function measure(file, profile) {
  const img = readPng(file);
  const { width: W, height: H, data: d } = img;
  const mask = garmentMask(img, profile);

  // The drawn body, so every fraction means the same thing on a pose cropped
  // tall as on one cropped wide.
  let by0 = H, by1 = 0, bx0 = W, bx1 = 0;
  for (let p = 0; p < W * H; p++) {
    if (d[p * 4 + 3] < 24) continue;
    const x = p % W;
    const y = (p - x) / W;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;

  let keyed = 0;
  let top = H;
  let bottom = 0;
  let hem = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    keyed++;
    const x = p % W;
    const y = (p - x) / W;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    // An opaque neighbour means this opening has the cloth's own edge drawn
    // around it — the difference between a hem and a tear.
    if (x > 0 && !mask[p - 1] && d[(p - 1) * 4 + 3] > 200) hem++;
  }

  return {
    art: hashOf(file),
    share: keyed ? Number((keyed / (bw * bh)).toFixed(4)) : 0,
    top: keyed ? Number(((top - by0) / bh).toFixed(3)) : 0,
    bottom: keyed ? Number(((bottom - by0) / bh).toFixed(3)) : 0,
    hem,
  };
}

const previous = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : { frames: {} };
const blessed = {};

for (const [charKey, profile] of Object.entries(GARMENTS)) {
  if (ONLY && charKey !== ONLY) continue;
  const frames = manifest.characters?.[charKey];
  if (!frames) {
    fail(charKey, "has a garment profile but no frames in the sprite manifest");
    continue;
  }

  for (const [frameKey, meta] of Object.entries(frames)) {
    const id = `${charKey}/${frameKey}`;
    const file = path.join(SPRITES, meta.file);
    // A pose the profile skips is not keyed at all, so there is no mask to
    // measure — but its art is still hashed. That is the point: `skip` is a
    // judgement about a DRAWING ("this one is a gown, keying it erases her"),
    // and a redraw of that pose is exactly when somebody should look again.
    if (profile.skip?.includes(frameKey)) {
      const now = { art: hashOf(file), skipped: true };
      blessed[id] = now;
      if (VERBOSE) console.log(`     ${id.padEnd(26)}   skipped by profile`);
      if (BLESS) continue;
      const was = previous.frames?.[id];
      if (!was) fail(id, "is skipped by the profile but has never been blessed — --bless to record it");
      else if (!was.skipped) fail(id, "was keyed when blessed and is now skipped by the profile — --bless if deliberate");
      else if (was.art !== now.art) {
        fail(id, `THE ART MOVED (${was.art} -> ${now.art}) on a pose the profile SKIPS.\n` +
                 "       It was skipped because of how it was drawn; if the redraw changed that, " +
                 "take it out of `skip` in src/clothing_fx.js. Either way, --bless.");
      }
      continue;
    }
    const now = measure(file, profile);
    blessed[id] = now;
    if (VERBOSE) {
      console.log(`     ${id.padEnd(26)} ${(now.share * 100).toFixed(1).padStart(5)}%  ` +
                  `band ${(now.top * 100).toFixed(0)}-${(now.bottom * 100).toFixed(0)}%`);
    }
    if (BLESS) continue;

    // Sanity first: these hold whatever the baseline says.
    if (now.share < SANE.minShare) {
      fail(id, `the key finds almost no garment — ${(now.share * 100).toFixed(2)}% of the body box`);
      continue;
    }
    if (now.share > SANE.maxShare) {
      fail(id, `the key takes ${(now.share * 100).toFixed(0)}% of the body box — that is the body, not the cloth`);
      continue;
    }
    if (now.hem === 0) {
      fail(id, "no opaque pixel borders the opening — the hem erode is not leaving " +
               "the cloth's outline, so this frame reads as a tear rather than a hem");
      continue;
    }

    const was = previous.frames?.[id];
    if (!was) {
      fail(id, "a frame the key has never been verified on. Render it with\n" +
               `       node tools/uro_seethrough_test.mjs --poses ${frameKey}\n` +
               "       and if it looks right, run this with --bless.");
      continue;
    }
    if (was.art !== now.art) {
      fail(id, `THE ART MOVED (${was.art} -> ${now.art}). The key now takes ` +
               `${(now.share * 100).toFixed(1)}% where it took ${(was.share * 100).toFixed(1)}%.\n` +
               `       Look at it — node tools/uro_seethrough_test.mjs --poses ${frameKey} — then --bless.`);
      continue;
    }
    const moved = [];
    if (Math.abs(now.share - was.share) > TOL.share) {
      moved.push(`share ${(was.share * 100).toFixed(1)}% -> ${(now.share * 100).toFixed(1)}%`);
    }
    if (Math.abs(now.top - was.top) > TOL.band) moved.push(`top ${was.top} -> ${now.top}`);
    if (Math.abs(now.bottom - was.bottom) > TOL.band) moved.push(`bottom ${was.bottom} -> ${now.bottom}`);
    if (moved.length) {
      fail(id, `THE KEY MOVED on unchanged art: ${moved.join(", ")}.\n` +
               "       The garment profile in src/clothing_fx.js changed. If that was " +
               "deliberate, look at the sheet and --bless.");
    }
  }
}

// A baseline entry with no frame behind it is a pose that was renamed or
// deleted. Harmless to the game and a lie in the repo, so it fails too.
if (!BLESS && !ONLY) {
  for (const id of Object.keys(previous.frames || {})) {
    if (!blessed[id]) fail(id, "is in clothing_fx.json but no longer in the sprite manifest — --bless to drop it");
  }
}

if (BLESS) {
  const out = {
    // Read by nothing; written for the person who opens this file cold.
    note: "What Clothing FX (src/clothing_fx.js) takes out of each frame, and " +
          "the hash of the drawing it was verified against. Regenerated with " +
          "`node tools/check_clothing_fx.mjs --bless` after LOOKING at the " +
          "frames. See sprites/docs/asset-pipeline.md.",
    frames: Object.fromEntries(Object.entries(blessed).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`blessed ${Object.keys(blessed).length} frames -> ${path.relative(ROOT, BASELINE)}`);
} else if (failures) {
  console.log(`\n${failures} clothing-fx failure(s)`);
  process.exit(1);
} else {
  console.log(`ok   clothing fx: ${Object.keys(blessed).length} frames key as verified`);
}
