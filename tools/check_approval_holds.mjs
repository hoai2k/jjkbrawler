// A delivery is a proposal until somebody says yes — including a FIRST one.
//
// The confirm step (assets/intake/README.md) rests on one promise: importing
// changes what the workbench shows and nothing about what a player sees. For a
// replacement that is easy to picture, and `tools/test_intake_approval.py`
// proves the intake half of it. This is the RENDERER half, and the case it
// exists for is the one that used to be exempt.
//
// A pose the manifest has never carried is still being drawn. An animation
// whose art has not landed plays its `fallback` (sprites.js presentFrames) —
// the walk is the run replayed slowly, the teeter is the idle, a diagonal
// attack is the strike it was declared beside — so landing a first delivery
// changes what a player sees exactly as overwriting one does. "New" describes
// the manifest, not the screen.
//
// The rule that keeps the promise is one line in `frameMeta` (src/assets.js): a
// hold with no `live` block answers null, and every "is this drawn" question in
// the game is that lookup. This asserts the consequences, against the real
// manifest and the game's own modules:
//
//   1. a held first delivery is invisible — `frameMeta` says nothing is there
//   2. so its states go on resolving to exactly the frames they resolved to
//      before it landed
//   3. and approving it — dropping the marker — is what puts it on screen
//   4. while a held REPLACEMENT still shows the drawing it replaces, which is
//      the case that already worked and must not have been broken on the way
//
//   node tools/check_approval_holds.mjs
//
// Exit code is 0 when the promise holds and 1 when it does not, so it can gate
// the check suite.
import { readFile } from "fs/promises";

const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, "").split("?")[0], ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

// A NAMESPACE import, not a destructure: `spriteManifest` is filled in by
// loadCoreAssets, and destructuring copies the null that is there beforehand.
const assets = await import("../src/assets.js");
const { frameMeta } = assets;
await assets.loadCoreAssets();
const { spriteManifest } = assets;
const { resolvedAnim, animsOf, clearAnimFrameCache, statesUsingFrame } =
  await import("../sprites/src/sprites.js");

let fails = 0;
const check = (ok, label, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? `  ${extra}` : ""}`);
};

// A pose the game DRAWS, borrowed as the body of a fake delivery. Nothing is
// written: the manifest object is mutated in memory and put back, so this reads
// the shipped data and leaves it alone.
function findCase() {
  for (const [charKey, frames] of Object.entries(spriteManifest.characters || {})) {
    const anims = animsOf(charKey);
    for (const [state, anim] of Object.entries(anims)) {
      // A state whose art is undelivered and whose fallback resolves: exactly
      // the shape a first delivery lands into.
      if (!anim.fallback?.length) continue;
      const missing = anim.frames.find((k) => !frames[k]);
      if (!missing) continue;
      const playing = resolvedAnim(charKey, state)?.frames || [];
      if (!playing.length || playing.includes(missing)) continue;
      const donor = Object.entries(frames).find(([, m]) => m?.file);
      if (donor) return { charKey, state, frameKey: missing, playing, donor: donor[1] };
    }
  }
  return null;
}

const found = findCase();
if (!found) {
  // Not a pass and not a failure: the roster being complete is the goal, and a
  // check that quietly reports OK on an empty set is worse than one that says
  // it could not ask.
  console.log("no fighter is currently missing a pose whose state has a fallback —"
    + " nothing to hold, so nothing to check.");
  process.exit(0);
}
const { charKey, state, frameKey, playing, donor } = found;
console.log(`${charKey}/${frameKey}: ${state} currently plays ${playing.join("+")}\n`);

const frames = spriteManifest.characters[charKey];
const STAMP = "2026-01-01T00:00:00+00:00";
const held = {
  ...Object.fromEntries(Object.entries(donor).filter(([k]) =>
    ["w", "h", "ox", "oy", "bodyBottom", "bodyH", "renderScale", "file"].includes(k))),
  awaitingApproval: { at: STAMP, live: null },
};
frames[frameKey] = held;
clearAnimFrameCache();

check(frameMeta(charKey, frameKey) === null,
  "a held first delivery is invisible to the game", String(frameMeta(charKey, frameKey)));
check(frameMeta(charKey, frameKey, { preview: true })?.file === donor.file,
  "and visible to the workbench, which has to place it",
  frameMeta(charKey, frameKey, { preview: true })?.file);
const after = resolvedAnim(charKey, state)?.frames || [];
check(after.join("+") === playing.join("+"),
  `so ${state} goes on playing what it played before the delivery`, after.join("+"));
check(!statesUsingFrame(charKey, frameKey).length,
  "and nothing in the game reports it as drawn",
  statesUsingFrame(charKey, frameKey).join(", ") || "(none)");

// Approving is the absence of the marker, which is the whole of what "yes"
// means — so the same manifest entry without it has to reach the screen.
delete frames[frameKey].awaitingApproval;
clearAnimFrameCache();
const approved = resolvedAnim(charKey, state)?.frames || [];
check(frameMeta(charKey, frameKey)?.file === donor.file,
  "approving it — dropping the marker — puts it in the game", frameMeta(charKey, frameKey)?.file);
check(approved.includes(frameKey),
  `and ${state} draws it instead of the fallback`, approved.join("+"));

// The case that already worked. A hold WITH a live block keeps showing the
// drawing it names, and the newcomer stays in the workbench.
frames[frameKey] = {
  ...held,
  file: `${charKey}/incoming/${frameKey}.png`,
  awaitingApproval: { at: STAMP, live: { ...donor } },
};
clearAnimFrameCache();
check(frameMeta(charKey, frameKey)?.file === donor.file,
  "a held REPLACEMENT still draws the art it replaces", frameMeta(charKey, frameKey)?.file);
check(frameMeta(charKey, frameKey, { preview: true })?.file.includes("incoming/"),
  "with the newcomer on the workbench's side of the wall",
  frameMeta(charKey, frameKey, { preview: true })?.file);

delete frames[frameKey];
clearAnimFrameCache();
console.log("\n" + (fails ? `${fails} check(s) failed` : "All checks pass"));
process.exit(fails ? 1 : 0);
