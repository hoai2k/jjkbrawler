// Smoke the SPECIALS WORKBENCH (`/workbench/?edit=specials`).
//
// The bench's claim is that its preview is the move rather than a picture of
// one: it stands up a real match and calls the game's own performSpecial /
// performUltimate / performDomain. That claim is exactly what a screenshot
// cannot check, so this drives the page — clicks every technique of several
// fighters, in the browser, through the real UI — and asserts that each cast
// actually put something on the board and that nothing threw on the way.
//
// It also checks the two things the page is FOR. Every fighter must list every
// technique their kit has (a special missing from this list is a special
// nobody will balance), and every listed technique must carry a button, taken
// from the control map rather than written on the page.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_specials_bench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => {
  // Undelivered optional art logs a 404 through the console the same way it
  // does in a match; it is not a broken bench (see tools/smoke_combat.mjs).
  const t = m.text();
  if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t.slice(0, 300));
});

await page.goto(`${BASE}/sprites/workbench/?edit=specials`, { waitUntil: "load" });
await page.waitForSelector(".sp-card[data-action]", { timeout: 60000 });

// ---- the dropdown is the roster, alphabetically
const roster = await page.evaluate(() =>
  [...document.getElementById("spChar").options].map((o) => o.textContent));
const sorted = [...roster].sort((a, b) => a.localeCompare(b));
check(roster.length > 20, "the fighter dropdown is the whole roster", `${roster.length} fighters`);
check(JSON.stringify(roster) === JSON.stringify(sorted), "and it is alphabetical",
      roster.slice(0, 3).join(", ") + " …");

// ---- every fighter lists every technique their kit has, with a button
const audit = await page.evaluate(async () => {
  const { CHARACTERS, CHARACTER_KEYS } = await import("/src/characters.js");
  const out = [];
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    out.push({
      key,
      specials: Object.keys(c.specials || {}).filter((s) => ["neutral", "side", "down"].includes(s)).length,
      ult: c.ultimate ? 1 : 0,
      domains: (c.domains || []).length,
    });
  }
  return out;
});

const sel = page.locator("#spChar");
let castChecks = 0;
let missing = [];
let unmapped = [];

// Every fighter's LIST is checked; a handful are also played, because casting
// is the slow part and the list is the part that goes stale.
const PLAY = ["gojo", "megumi", "sukuna", "yuta", "hakari"];

for (const row of audit) {
  await sel.selectOption(row.key);
  await page.waitForFunction(
    (k) => document.getElementById("spChar").value === k
        && document.querySelectorAll(".sp-card").length > 0,
    row.key, { timeout: 30000 });

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll(".sp-card")].map((el) => ({
      slot: el.querySelector(".sp-slot")?.textContent || "",
      map: el.querySelector(".sp-map")?.textContent || "",
      name: el.querySelector(".sp-name")?.textContent || "",
      playable: el.hasAttribute("data-action"),
    })));

  // The kit's own count against the page's. A domain-less fighter shows one
  // card either way — their Simple Domain, or the "None" note — so the
  // expected total is the same number in both cases.
  const want = row.specials + row.ult + Math.max(row.domains, 1);
  if (cards.length !== want) missing.push(`${row.key}: ${cards.length} cards, kit has ${want}`);
  for (const c of cards) {
    if (c.playable && !c.map.trim()) unmapped.push(`${row.key} — ${c.name}`);
  }

  if (!PLAY.includes(row.key)) continue;

  // Play every technique this fighter has and confirm the cast reached the
  // board: a special that produced no hitbox, no projectile, no entity and no
  // action on the caster did not happen.
  const n = cards.filter((c) => c.playable).length;
  for (let i = 0; i < n; i++) {
    await page.evaluate((idx) => {
      document.querySelectorAll(".sp-card[data-action]")[idx].click();
    }, i);
    const landed = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      let best = 0;
      // Watch a couple of seconds of the run — a spoken command holds the
      // caster's pose for most of a second before the move itself goes off.
      for (let f = 0; f < 130; f++) {
        await new Promise(requestAnimationFrame);
        best = Math.max(best, state.hitboxes.length + state.projectiles.length
                            + state.entities.length + (state.fighters[0]?.action ? 1 : 0)
                            + (state.domain ? 1 : 0) + (state.domainCasting ? 1 : 0));
      }
      return best;
    });
    const name = cards.filter((c) => c.playable)[i].name;
    if (!landed) missing.push(`${row.key} — ${name}: cast put nothing on the board`);
    castChecks++;
  }
}

check(!missing.length, `every fighter lists every technique in their kit`,
      missing.length ? missing.slice(0, 6).join(" · ") : `${audit.length} fighters`);
check(!unmapped.length, "and every playable technique carries a button",
      unmapped.length ? unmapped.slice(0, 6).join(" · ") : "from config_controls.js");
check(castChecks > 20, "techniques played end to end", `${castChecks} casts across ${PLAY.length} fighters`);
check(!errors.length, "nothing threw", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall specials bench checks passed");
process.exit(failures ? 1 : 0);
