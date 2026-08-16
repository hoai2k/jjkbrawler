// The CPU's ring on the roster is a SELECTOR, and it appears when it becomes one.
//
// A coloured box on the character grid reads as a cursor: this is yours, this
// is where your next press lands. In a one-player match the CPU's box was
// painted from the moment the screen opened, sitting on Random beside the
// player's own — a second cursor of theirs, in a colour they had not chosen,
// moving for reasons they could not see. It only becomes a selector once they
// have locked themselves in and their own cursor moves over to picking their
// opponent (ui.steeredSlot), which is when it now appears.
//
// Which fighter the CPU currently holds is NOT hidden — that is on their hero
// card the whole time. It is the ring on the grid that waits.
//
// Usage: node tools/smoke_cpu_marker.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
await page.goto(`${BASE}/index.html?camera=flat`);
await pressStart(page);
await page.waitForTimeout(1200);

/** Every ring currently on the grid, and what its tag says. */
const marks = () => page.evaluate(() => [...document.querySelectorAll(".char-card.is-marked")]
  .map((c) => ({
    char: c.dataset.character,
    tags: [...c.querySelectorAll(".pick-tag")].map((t) => t.textContent),
  })));

/** …and what the CPU's hero card is showing, which must never go blank. */
const heroCpu = () => page.evaluate(() => {
  const sides = [...document.querySelectorAll(".matchup-side")];
  const cpu = sides[sides.length - 1];
  return {
    text: (cpu?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    hasArt: !!cpu?.querySelector("img, .random-glyph, [class*=placeholder]"),
  };
});

const browsing = await marks();
const hero0 = await heroCpu();
check(!browsing.some((m) => m.tags.includes("CPU")),
  "while the player is still choosing, no CPU ring sits on the roster",
  browsing.length ? `found ${JSON.stringify(browsing)}` : "no rings at all");
check(hero0.text.length > 0,
  "...and the CPU's own card still says what they are holding",
  `hero card reads "${hero0.text}"`);

// Lock the player in. Their selector moves to the opponent, so the ring is now
// genuinely theirs to steer — and now it should be there.
await page.click('[data-character="gojo"]');
await page.waitForTimeout(900);
const locked = await marks();
check(locked.some((m) => m.tags.includes("P1")),
  "locking in marks the player's own fighter",
  JSON.stringify(locked));
check(locked.some((m) => m.tags.includes("CPU")),
  "...and the CPU ring appears, now that the player is steering it",
  JSON.stringify(locked));

// Backing out hands the selector back, so the ring goes away again.
await page.keyboard.press("Backspace");
await page.waitForTimeout(900);
const released = await marks();
check(!released.some((m) => m.tags.includes("CPU")),
  "backing out takes it away again",
  released.length ? JSON.stringify(released) : "no rings at all");

// A LOCAL VERSUS MATCH IS UNTOUCHED: every slot on screen belongs to a person,
// so every ring is somebody's cursor from the start.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  state.playerCount = 2;
  const ui = await import("/src/ui.js");
  ui.updateSelectionUi?.();
});
await page.waitForTimeout(600);
const versus = await marks();
check(!versus.some((m) => m.tags.includes("CPU")),
  "in a two-player match nothing is labelled CPU at all",
  JSON.stringify(versus));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall CPU marker checks passed");
process.exit(failed ? 1 : 0);
