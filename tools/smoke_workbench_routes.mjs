// The workbench hub: does `/workbench/?edit=<mode>` land on the right bench?
//
// Four benches live in four directories, and `/workbench/?edit=` is the one
// address that reaches all of them. That indirection is only worth having if it
// is reliable — a shortcut that silently drops you somewhere else is worse than
// the long path it replaced — so every route is walked here, including the
// aliases and the "keep the rest of the query" rule that makes `?edit=pose&
// char=gojo` a deep link rather than a guess.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/smoke_workbench_routes.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
function ok(pass, label, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
}

// mode -> the path it must end on. The canonical spellings and their aliases
// both appear, because an alias that stops resolving is exactly the kind of
// quiet rot this file exists to catch.
const ROUTES = [
  ["audio", "/workbench/"],
  ["voice", "/workbench/"],
  ["sprites", "/sprites/workbench/"],
  ["sprite", "/sprites/workbench/"],
  ["2d", "/sprites/workbench/"],
  ["actions", "/sprites/workbench/"],
  ["billboards", "/billboards/workbench/"],
  ["billboard", "/billboards/workbench/"],
  ["3d", "/render3d/workbench/"],
  ["render3d", "/render3d/workbench/"],
  ["anime", "/render3d/workbench/"],
  ["animation", "/render3d/workbench/"],
  ["anim", "/render3d/workbench/"],
  ["pose", "/render3d/workbench/"],
  ["reads", "/render3d/workbench/"],
];

const page = await browser.newPage();
for (const [mode, expectPath] of ROUTES) {
  await page.goto(`${BASE}/workbench/?edit=${mode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const url = new URL(page.url());
  ok(url.pathname === expectPath, `?edit=${mode}`, `→ ${url.pathname}${url.search}`);
}

// Five benches live at /workbench/ itself, so a pathname cannot tell them
// apart — which is exactly why they are the easy ones to break. `data-bench` on
// the root element is what the router decides and what index.html and the
// module loader both act on, so that is the thing to assert.
for (const [mode, expect] of [
  ["audio", "audio"], ["voice", "audio"],
  ["verification", "verification"], ["review", "verification"], ["queue", "verification"],
  ["cards", "cards"], ["card", "cards"], ["crop", "cards"], ["focus", "cards"],
  ["character", "character"], ["char", "character"], ["fighter", "character"],
  ["roster", "character"], ["moves", "character"],
  ["arena", "arena"], ["arenas", "arena"], ["stage", "arena"], ["board", "arena"],
  ["platforms", "arena"], ["terrain", "arena"],
]) {
  await page.goto(`${BASE}/workbench/?edit=${mode}`, { waitUntil: "load" });
  await page.waitForTimeout(600);
  const got = await page.evaluate(() => ({
    bench: document.documentElement.dataset.bench,
    // …and the bench that was NOT asked for must be gone, not merely hidden:
    // its ids would otherwise answer the live bench's getElementById.
    bars: document.querySelectorAll(".bar").length,
    title: document.title,
  }));
  ok(got.bench === expect && got.bars === 1,
     `?edit=${mode} is the ${expect} bench`, `data-bench=${got.bench}, ${got.bars} header(s), “${got.title}”`);
}

// The modes that carry their own `edit` through to the destination must arrive
// with it — landing on the 3D directory is not the same as landing on the
// keyframe bench.
for (const [mode, expectEdit] of [["actions", "actions"], ["animation", "animation"], ["pose", "pose"], ["reads", "reads"]]) {
  await page.goto(`${BASE}/workbench/?edit=${mode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const got = new URL(page.url()).searchParams.get("edit");
  ok(got === expectEdit, `?edit=${mode} keeps its own edit=`, `→ edit=${got}`);
}

// Everything else the caller passed travels with them.
await page.goto(`${BASE}/workbench/?edit=pose&char=gojo`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(150);
{
  const url = new URL(page.url());
  ok(url.pathname === "/render3d/workbench/" && url.searchParams.get("char") === "gojo",
     "?edit=pose&char=gojo keeps the fighter", `→ ${url.pathname}${url.search}`);
}

// A mode nobody has stays put and says so, rather than erroring or redirecting
// somewhere arbitrary.
await page.goto(`${BASE}/workbench/?edit=nosuchbench`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
{
  const url = new URL(page.url());
  const note = await page.evaluate(() => {
    const el = document.getElementById("unknownMode");
    return el && !el.hidden ? el.textContent : null;
  });
  ok(url.pathname === "/workbench/" && !!note, "an unknown mode stays on the audio bench and says so",
     note ? `“${note}”` : "(no note shown)");
}

// The bare address is the audio bench, with no redirect.
await page.goto(`${BASE}/workbench/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(150);
ok(new URL(page.url()).pathname === "/workbench/", "/workbench/ with no query is the audio bench");

// ---- the deploy stamp, on every bench
//
// It exists to answer "is this my change?", so a bench that quietly lost the
// script tag would leave that question unanswerable exactly when it is asked.
// The dev server has no version.json — that reading is the local one, and it
// has to say so rather than going blank, or a missing stamp and a working one
// look the same.
// The two benches that build their OWN header are the ones this went missing
// on: the stamp used to mount into the audio shell that index.html was about
// to delete, and go with it.
for (const [path, name] of [
  ["/workbench/?edit=audio", "audio"],
  ["/workbench/?edit=verification", "verification"],
  ["/workbench/?edit=cards", "cards"],
  ["/workbench/?edit=character", "character"],
  ["/workbench/?edit=arena", "arena"],
  ["/sprites/workbench/", "sprites"],
  ["/billboards/workbench/", "billboards"],
  ["/render3d/workbench/", "3d"],
]) {
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => {
    const el = document.querySelector(".deploy-stamp");
    return el && { text: el.textContent, href: el.getAttribute("href"), inBar: !!el.closest(".bar") };
  });
  ok(!!s && s.inBar && /local/.test(s.text) && /actions/.test(s.href),
     `${name} bench carries the deploy stamp`, s ? `“${s.text}”` : "(no stamp)");
}

// With a stamp published it reports the commit, its age and its run.
await page.route("**/version.json*", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({
    sha: "0123456789abcdef", short: "0123456", ref: "main", title: "Test",
    deployed: new Date(Date.now() - 3e5).toISOString(),
    run: "https://github.com/hoai2k/jjkbrawler/actions/runs/1", runNumber: 1,
  }),
}));
await page.goto(`${BASE}/workbench/?edit=audio`, { waitUntil: "load" });
await page.waitForTimeout(1500);
{
  const s = await page.evaluate(() => {
    const el = document.querySelector(".deploy-stamp");
    return { text: el.textContent, href: el.getAttribute("href"), sha: el.dataset.sha };
  });
  ok(/deployed 0123456/.test(s.text) && /min ago/.test(s.text) && /actions\/runs\/1$/.test(s.href)
     && s.sha === "0123456789abcdef",
     "a published stamp names the commit, its age and its run", `“${s.text}” → ${s.href}`);
}
await page.unroute("**/version.json*");

await browser.close();
console.log(failed ? `\n${failed} route(s) wrong` : "\nevery workbench shortcut lands where it says");
process.exit(failed ? 1 : 0);
