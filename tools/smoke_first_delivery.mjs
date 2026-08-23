// A first delivery is held, and the workbench can still answer for it.
//
// `tools/check_approval_holds.mjs` proves the renderer half of this with no
// browser: a pose held with no `live` block is invisible to the game and its
// states go on playing their fallback. That is the promise. This is the other
// half — that the pose somebody has to PLACE and decide about is still reachable
// while the promise is being kept, which is the part that quietly breaks.
//
// It nearly did. Every "is this pose in the working set" question in the bench
// runs through `statesUsing`, which asks the game what a state resolves to — and
// the true answer for a held newcomer is "nothing draws it", which would have
// dropped it out of three of the five views as an unused sheet cell. See the
// note on `statesUsing` in bench_model.js for what it asks instead.
//
// The pose is injected into the manifest ON DISK, because the bench loads it
// over the network like the game does, and taken out again in a `finally`. The
// file is compared against its backup before this exits, so a run that damaged
// it says so rather than leaving it damaged.
//
//   node tools/server.mjs &                       # or: npm start
//   node tools/smoke_first_delivery.mjs [base-url]
import { chromium } from "playwright";
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const ROOT = new URL("../", import.meta.url);
const MAN = new URL("sprites/assets/manifest.json", ROOT);
const BAK = new URL("sprites/assets/manifest.smoke-backup.json", ROOT);

let fails = 0;
const check = (ok, label, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? `  ${extra}` : ""}`);
};

const original = readFileSync(MAN, "utf8");
const man = JSON.parse(original);

/** A pose a fighter is expected to have, has not been drawn, and whose state
 *  falls back to something that IS drawn — the shape a first delivery lands
 *  into. Found rather than named: which poses are outstanding changes every
 *  round, and a hard-coded one would quietly stop testing anything the day it
 *  was delivered. */
function findGap(anims) {
  for (const [charKey, frames] of Object.entries(man.characters)) {
    for (const [state, anim] of Object.entries(anims[charKey] || {})) {
      if (!anim.fallback?.length) continue;
      const missing = anim.frames.find((k) => !frames[k]);
      if (missing && anim.fallback.some((k) => frames[k])) {
        return { charKey, state, frameKey: missing };
      }
    }
  }
  return null;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
try {
  copyFileSync(MAN, BAK);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // The anim tables come from the game's own module rather than a regex, the
  // way every other tool here resolves them.
  await page.goto(`${BASE}/sprites/workbench/`, { waitUntil: "networkidle" });
  const anims = await page.evaluate(async () => {
    const { CHARACTER_KEYS } = await import("/src/characters.js");
    const { animsOf } = await import("/sprites/src/sprites.js");
    return Object.fromEntries(CHARACTER_KEYS.map((k) => [k, animsOf(k)]));
  });

  const gap = findGap(anims);
  if (!gap) {
    console.log("every declared pose has been drawn — nothing outstanding to"
      + " stand a first delivery in for, so there is nothing to check.");
  } else {
    const { charKey, state, frameKey } = gap;
    const frames = man.characters[charKey];
    const donor = frames[anims[charKey][state].fallback.find((k) => frames[k])];
    console.log(`${charKey}/${frameKey}: ${state} falls back on ${donor.file}\n`);

    // The delivery: the donor's drawing under the undrawn pose's name, held the
    // way tools/intake_import.py holds one.
    frames[frameKey] = {
      ...Object.fromEntries(["w", "h", "ox", "oy", "bodyBottom", "bodyH", "renderScale", "file"]
        .filter((k) => k in donor).map((k) => [k, donor[k]])),
      replaced: { at: "2026-01-01T00:00:00+00:00", kept: "await", how: "await", lost: [] },
      awaitingApproval: { at: "2026-01-01T00:00:00+00:00", live: null },
    };
    writeFileSync(MAN, `${JSON.stringify(man, null, 1)}\n`);

    await page.goto(`${BASE}/sprites/workbench/?char=${charKey}&frame=${frameKey}`,
                    { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.getElementById("approvalGroup")?.hidden
      || document.getElementById("approvalLabel")?.textContent, null, { timeout: 15000 });

    const shown = await page.evaluate((key) => {
      const cell = [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim().startsWith(key));
      return {
        hidden: document.getElementById("approvalGroup")?.hidden,
        label: document.getElementById("approvalLabel")?.textContent,
        info: document.getElementById("approvalInfo")?.textContent || "",
        keep: document.getElementById("keepBtn")?.textContent || "",
        cls: cell?.className || null,
        alt: !document.querySelector('#selfIdleMode option[value="alternate"]')?.hidden,
      };
    }, frameKey);

    check(shown.hidden === false, "the pose asks its question", String(shown.hidden));
    check(shown.label === "First delivery waiting",
          "and says which question it is", shown.label);
    check(/fallback/i.test(shown.info),
          "naming what the game is drawing instead", shown.info.slice(0, 80));
    check(/keep it out/i.test(shown.keep),
          "with a 'keep' that means what it does here", shown.keep.trim());
    check(shown.cls?.includes("awaiting"),
          "the pose is in the grid, marked as waiting", shown.cls);
    check(shown.alt, "and the drawing it stands beside is offered as the comparison");

    // Keeping it out has to keep it out. There is no older drawing of this pose
    // to put back, so the answer is a hold that stays.
    await page.click("#keepBtn");
    await page.waitForTimeout(400);
    const after = await page.evaluate(async (key) => {
      const assets = await import("/src/assets.js");
      const { resolvedAnim } = await import("/sprites/src/sprites.js");
      const [charKey, frameKey, animKey] = key;
      return {
        declined: !!assets.spriteManifest.characters[charKey][frameKey]
          ?.awaitingApproval?.declined,
        drawn: assets.frameMeta(charKey, frameKey),
        plays: resolvedAnim(charKey, animKey)?.frames || [],
      };
    }, [charKey, frameKey, state]);

    check(after.declined, "keeping it out leaves the hold in place, answered");
    check(after.drawn === null, "so the game still draws nothing for the pose",
          String(after.drawn));
    check(!after.plays.includes(frameKey),
          `and ${state} goes on playing its fallback`, after.plays.join("+"));
  }

  check(!errors.length, "no page errors", errors.join(" | "));
} finally {
  await browser.close();
  copyFileSync(BAK, MAN);
  rmSync(BAK, { force: true });
  // Said out loud rather than assumed: this tool writes to the manifest, and
  // "it put it back" is exactly the sort of claim that is worth checking.
  check(readFileSync(MAN, "utf8") === original,
        "the manifest is back the way it was found");
}

console.log("\n" + (fails ? `${fails} check(s) failed` : "All checks pass"));
process.exit(fails ? 1 : 0);
