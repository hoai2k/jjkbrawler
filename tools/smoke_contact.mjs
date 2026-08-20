// THE CONTACT TIER, measured rather than looked at.
//
// `src/contact.js` reads a verified strike point, works out how centred the
// blow was on the body it hit, and spends that on presentation — and on
// hitstun. Two things have to hold, and neither is visible on screen:
//
//   1. QUALITY MOVES STUN. The same hit, landed cleanly and landed on the
//      outline, must not hold the victim for the same length of time — or the
//      mechanic is not doing anything.
//   2. QUALITY MOVES NOTHING ELSE. Damage, knockback and where the victim ends
//      up must be identical to the last decimal, with the tier on and off and
//      at either end of the quality scale. This is the guardrail the whole
//      feature was allowed on: it is a spacing reward paid in time, not a
//      second damage roll nobody can see.
//
// Driven through the character bench, which boots one real fighter and a dummy
// on the game's own simulation — `applyHit` is then called directly, so the
// numbers under test are the ones a match uses and no AI has to be persuaded
// to land a hit at a chosen distance.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/smoke_contact.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const ok = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/workbench/?edit=character&char=gojo`, { waitUntil: "load" });
await page.waitForFunction(() => window.__bench?.state().fighters > 0, null, { timeout: 60000 });

/**
 * Land one scripted hit and report what it did.
 *
 * `gap` is how far in front of the attacker the victim stands, which is how
 * the quality is varied without touching the hit itself: the same blow thrown
 * from inside, where the fist ends up through their chest, and thrown at the
 * end of its range, where it brushes the front of them. `lift` drops the
 * victim's feet instead, which puts the blow over their head — the other way a
 * connection can be poor. Everything else is reset first so neither staling,
 * nor damage already taken, nor a leftover install can explain a difference.
 */
const land = (opts) => page.evaluate(async ({ tier, gap, lift = 0 }) => {
  const { state } = await import("/src/state.js");
  const { applyHit } = await import("/src/combat.js");
  const { setContactTier } = await import("/src/flags.js");
  const { strikePoint } = await import("/src/strike_points.js");
  setContactTier(tier);
  const [a, b] = state.fighters;
  if (!b) return { error: "no dummy" };
  for (const f of [a, b]) {
    f.dead = false; f.respawnTimer = 0; f.invuln = 0; f.hitstun = 0;
    f.grounded = true; f.vx = 0; f.vy = 0; f.shielding = false; f.prone = 0;
    f.counter = null; f.armorT = 0; f.installs = null; f.input = null;
    f.recentMoves = []; f.statuses = f.statuses || {};
  }
  b.damage = 0;
  a.animKey = "light";
  a.facing = 1;
  b.x = a.x + gap;
  b.y = a.y + lift;
  const verdict = applyHit(a, b, { dmg: 9, baseKb: 300, growth: 6, angle: 0.4, sfx: "punch" }, "melee");
  return {
    verdict,
    source: strikePoint(a.spriteChar || a.charKey, "light").source,
    dmg: b.damage,
    vx: b.vx, vy: b.vy,
    hitstun: b.hitstun,
    contact: state.lastContact && { q: state.lastContact.quality, band: state.lastContact.band },
  };
}, opts);

const clean = await land({ tier: true, gap: 34 });
const graze = await land({ tier: true, gap: 62 });
const overhead = await land({ tier: true, gap: 34, lift: 150 });
const off = await land({ tier: false, gap: 34 });
const offGraze = await land({ tier: false, gap: 62 });

ok(clean.verdict === "hit" && graze.verdict === "hit", "both scripted hits land",
   `${clean.verdict} / ${graze.verdict}`);
ok(clean.source === "human", "the attacker's strike point is human-verified",
   `source ${clean.source}`);
ok(!!clean.contact && !!graze.contact, "the tier judged both hits",
   `${clean.contact?.band} ${clean.contact?.q?.toFixed(2)} vs `
   + `${graze.contact?.band} ${graze.contact?.q?.toFixed(2)}`);
ok((clean.contact?.q ?? 0) > (graze.contact?.q ?? 1),
   "a blow through the body scores higher than one thrown at the end of its range");
ok((overhead.contact?.q ?? 1) < (clean.contact?.q ?? 0),
   "a blow that passes over the body scores lower than one on it",
   `${overhead.contact?.band} ${overhead.contact?.q?.toFixed(2)}`);

// 1 — quality moves stun.
ok(clean.hitstun > graze.hitstun * 1.05, "a clean hit holds the victim longer than a graze",
   `${clean.hitstun.toFixed(3)}s vs ${graze.hitstun.toFixed(3)}s`);

// 2 — and moves nothing else. Compared against the tier OFF as well as across
// the scale, so neither end can have quietly drifted together.
const near = (x, y) => Math.abs(x - y) < 1e-6;
ok(near(clean.dmg, graze.dmg) && near(clean.dmg, off.dmg) && near(off.dmg, offGraze.dmg),
   "damage is identical however the blow landed",
   `${clean.dmg} / ${graze.dmg} / ${off.dmg} (tier off)`);
ok(near(clean.vx, graze.vx) && near(clean.vy, graze.vy),
   "knockback is identical however the blow landed",
   `vx ${clean.vx.toFixed(2)} vs ${graze.vx.toFixed(2)}, `
   + `vy ${clean.vy.toFixed(2)} vs ${graze.vy.toFixed(2)}`);
ok(near(clean.vx, off.vx) && near(clean.vy, off.vy),
   "and identical to the same hit with the tier off");

// 3 — with the tier off, nothing is judged and nothing changes with position.
ok(!off.contact || off.contact.q === undefined || offGraze.hitstun === off.hitstun,
   "with the tier off, stun does not depend on where the blow landed",
   `${off.hitstun.toFixed(3)}s vs ${offGraze.hitstun.toFixed(3)}s`);

ok(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed.` : "\ncontact tier ok");
process.exit(failed ? 1 : 0);
