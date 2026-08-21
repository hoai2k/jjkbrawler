// Two controllers in the menu: seats, join, and independent cursors.
//
// The bug this is built around could not be seen without two physical pads,
// which is why it shipped. `navigator.getGamepads()` returns a SPARSE array —
// a pad is invisible to the page until its owner touches it — so two pads
// plugged in with only the second one used report as `[null, pad]`. The old
// code compacted that list and handed out seats by position, which put player
// 2's pad in player 1's seat: their stick drove player 1's cursor, their own
// cursor never appeared, and the seating only corrected itself once player 1
// touched their pad and pushed the list back into shape. From the second
// player's chair that reads as "my controller does nothing until they move".
//
// Everything here drives fake pads through a stubbed `getGamepads`, so it needs
// no hardware and runs in CI. What it cannot check is the shape of the real
// browser's list — that assumption (sparse, holes where untouched pads are) is
// the thing the fix is built on, and it is stated here so a future reader can
// challenge it.
//
// Needs `playwright` and a running server: node tools/smoke_controllers.mjs
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

/** A page with `count` fake pads, `hidden` of which are held back the way an
 *  untouched pad is — as holes at the FRONT of the list. */
async function padPage({ pads = 2, hideFirst = false } = {}) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { failures++; console.log("FAIL page error", String(e)); });
  await page.addInitScript(([n, hide]) => {
    const mk = (index) => ({
      index, id: `fake pad ${index}`, connected: true, mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    });
    window.__pads = Array.from({ length: n }, (_, i) => mk(i));
    window.__hideFirst = hide;
    navigator.getGamepads = () =>
      (window.__hideFirst ? [null, ...window.__pads.slice(1)] : window.__pads);
  }, [pads, hideFirst]);
  await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
  await pressStart(page);
  await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
  await page.waitForTimeout(600);
  return page;
}

const seats = (page) => page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return {
    players: state.playerCount,
    mode: state.mode,
    // WHERE EACH PLAYER'S MARKER IS, read off the marker the roster actually
    // draws. This used to look for a `pad-focus-p<N>` class on the card, which
    // the select screen stopped emitting when the cursor and the commit became
    // one marker (ui.js renderRosterMarkers): every card matched nothing, every
    // cursor read `undefined`, and three checks failed on markup rather than on
    // behaviour. The marker is a `pick-tag--p<N>` tag inside the card now.
    cursors: [...document.querySelectorAll(".char-card .pick-tag")]
      .map((tag) => {
        const id = tag.className.match(/pick-tag--p(\d)/)?.[1];
        const card = tag.closest(".char-card");
        return id && card ? `p${id}=${card.dataset.character}` : null;
      })
      .filter(Boolean)
      .sort().join(" "),
  };
});

/** Push a pad's stick and let go — one deliberate menu input. */
async function push(page, padIndex, axis, value, ms = 420) {
  await page.evaluate(([p, a, v]) => { window.__pads[p].axes[a] = v; }, [padIndex, axis, value]);
  await page.waitForTimeout(ms);
  await page.evaluate(([p, a]) => { window.__pads[p].axes[a] = 0; }, [padIndex, axis]);
  await page.waitForTimeout(150);
}

// ---- 1. Two pads connected, nobody has done anything yet.
{
  const page = await padPage({ pads: 2 });
  const s = await seats(page);
  check(s.players === 2, "two pads seat two players without either one acting", `playerCount ${s.players}`);
  check(s.mode === "local", "…and the second slot stops being a CPU", `mode ${s.mode}`);
  check(/p1=/.test(s.cursors) && /p2=/.test(s.cursors),
    "…and both cursors are on the roster", s.cursors);
  await page.close();
}

// ---- 2. Player 2 moves FIRST. This is the reported symptom.
{
  const page = await padPage({ pads: 2 });
  const before = await seats(page);
  await push(page, 1, 1, 0.9);   // pad 2 pushes down; pad 1 never moves
  const after = await seats(page);
  const p2Before = before.cursors.match(/p2=(\S+)/)?.[1];
  const p2After = after.cursors.match(/p2=(\S+)/)?.[1];
  const p1Before = before.cursors.match(/p1=(\S+)/)?.[1];
  const p1After = after.cursors.match(/p1=(\S+)/)?.[1];
  check(p2After && p2After !== p2Before,
    "player 2 can move before player 1 has touched their pad", `${p2Before} -> ${p2After}`);
  check(p1After === p1Before,
    "…and it moves THEIR cursor, not player 1's", `p1 stayed on ${p1After}`);
  await page.close();
}

// ---- 3. The sparse list: player 1's pad is still untouched, so the browser
//         shows a hole where it sits. Player 2's pad must not inherit seat 1.
{
  const page = await padPage({ pads: 2, hideFirst: true });
  const alone = await seats(page);
  check(alone.players === 1, "one visible pad is one player", `playerCount ${alone.players}`);
  // Player 1 finally touches theirs and the list fills in behind the pad that
  // was already seated. Seats must not shuffle.
  await page.evaluate(() => { window.__hideFirst = false; });
  await page.waitForTimeout(400);
  const both = await seats(page);
  check(both.players === 2, "the pad that appears later joins as a second player", `playerCount ${both.players}`);
  check(both.mode === "local", "…and switches the match out of CPU mode", `mode ${both.mode}`);

  // The pad seated FIRST (index 1 here, because index 0 was hidden) keeps
  // seat 1 even though it is no longer first in the browser's list.
  const start = await seats(page);
  await push(page, 1, 0, 0.9);
  const moved = await seats(page);
  const p1 = (s) => s.cursors.match(/p1=(\S+)/)?.[1];
  const p2 = (s) => s.cursors.match(/p2=(\S+)/)?.[1];
  check(p1(moved) !== p1(start), "the first-seen pad keeps seat 1 when the list reshuffles",
    `${p1(start)} -> ${p1(moved)}`);
  check(p2(moved) === p2(start), "…and the late pad keeps seat 2", `p2 stayed on ${p2(moved)}`);
  await page.close();
}

/** Press and release a pad button. */
async function tap(page, padIndex, button = 0) {
  await page.evaluate(([p, b]) => { window.__pads[p].buttons[b].pressed = true; }, [padIndex, button]);
  await page.waitForTimeout(120);
  await page.evaluate(([p, b]) => { window.__pads[p].buttons[b].pressed = false; }, [padIndex, button]);
  await page.waitForTimeout(220);
}

/** Put one slot's cursor on a named fighter without going through the walk. */
async function hover(page, key) {
  await page.evaluate((k) => document.querySelector(`[data-character="${k}"]`)
    .dispatchEvent(new MouseEvent("mouseenter")), key);
  await page.waitForTimeout(200);
}

const cursorOf = (s, id) => s.cursors.match(new RegExp(`p${id}=(\\S+)`))?.[1];

// ---- 4. Eight seats. The engine has always seated eight fighters; every one
//         of them can now be a person, and the bar has to number them in order.
{
  const page = await padPage({ pads: 8 });
  const bar = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const cards = [...document.querySelectorAll(".matchup-side")].filter((c) => !c.classList.contains("hidden"));
    return {
      players: state.playerCount,
      seats: state.seats.join(","),
      // Reading order down the bar, which is what a player actually sees —
      // `order` places the cards, so DOM order says nothing on its own.
      order: cards.sort((a, b) => Number(a.style.order) - Number(b.style.order))
        .map((c) => c.dataset.seat).join(","),
    };
  });
  check(bar.players === 8, "eight pads seat eight players", `playerCount ${bar.players}`);
  check(bar.seats === "1,2,3,4,5,6,7,8", "…in seats 1-8", bar.seats);
  check(bar.order === "1,2,3,4,5,6,7,8", "…and the hero cards read Player 1 first", bar.order);
  await page.close();
}

// ---- 5. A seat that empties KEEPS ITS NUMBER. Player 2 of three unplugging
//         leaves players 1 and 3 alone rather than promoting player 3, and the
//         next pad to arrive drops into the hole rather than onto the end.
{
  const page = await padPage({ pads: 3 });
  const seating = () => page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const cards = [...document.querySelectorAll(".matchup-side")].filter((c) => !c.classList.contains("hidden"));
    return {
      players: state.playerCount,
      seats: state.seats.join(","),
      cards: cards.sort((a, b) => Number(a.style.order) - Number(b.style.order))
        .map((c) => c.dataset.seat).join(","),
    };
  });
  await page.evaluate(() => {
    const live = () => window.__pads.filter((p) => !window.__gone?.has(p.index));
    window.__gone = new Set();
    navigator.getGamepads = live;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__gone.add(1));   // player 2 walks off
  await page.waitForTimeout(400);
  const gone = await seating();
  check(gone.seats === "1,3", "player 2 leaving leaves players 1 and 3 where they are", gone.seats);
  check(gone.players === 3, "…so the match still has three seats", `playerCount ${gone.players}`);
  check(gone.cards === "1,3", "…and the bar shows those two, still numbered", gone.cards);

  await page.evaluate(() => window.__gone.delete(1)); // somebody picks a pad up
  await page.waitForTimeout(400);
  const back = await seating();
  check(back.seats === "1,2,3", "a pad joining fills the empty seat in the middle", back.seats);
  check(back.cards === "1,2,3", "…and slots itself back into the order", back.cards);
  await page.close();
}

// ---- 6. Locking a fighter in CLAIMS them: no other cursor may rest there, and
//         the walk steps over the card rather than stopping on it.
{
  const page = await padPage({ pads: 2 });
  await hover(page, "gojo");            // the active picker is player 1
  await tap(page, 0);                   // …who locks Gojo in
  const claimed = await page.evaluate(() =>
    [...document.querySelectorAll(".char-card.is-taken")].map((c) => c.dataset.character).join(","));
  check(claimed === "gojo", "a locked-in fighter is marked taken on the roster", claimed);

  // Player 2 is the active picker now, so the hover drives their cursor.
  await hover(page, "nanami");
  const before = await seats(page);
  check(cursorOf(before, 2) === "nanami", "player 2's cursor parks where it was put", before.cursors);
  // Nanami sits immediately to Gojo's right in the Faculty block, so this is a
  // press straight at the claimed card. One step only — the hold is shorter
  // than the cursor's repeat delay.
  await push(page, 1, 0, -0.95, 300);
  const after = await seats(page);
  check(cursorOf(after, 2) !== "gojo", "…and stepping toward a claimed fighter steps OVER them",
    `${cursorOf(before, 2)} -> ${cursorOf(after, 2)}`);

  // The mouse cannot get there either — the rule is on the cursor, not the pad.
  await hover(page, "gojo");
  const hovered = await seats(page);
  check(cursorOf(hovered, 2) !== "gojo", "hovering a claimed fighter does not move a cursor onto them",
    `p2 on ${cursorOf(hovered, 2)}`);
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(250);
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return `${state.ready[2]}:${state.selection[2]}`;
  });
  check(!ready.startsWith("true"), "…and clicking them does not commit a second player to them", ready);
  await page.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall controller checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
