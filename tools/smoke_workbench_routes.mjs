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

await browser.close();
console.log(failed ? `\n${failed} route(s) wrong` : "\nevery workbench shortcut lands where it says");
process.exit(failed ? 1 : 0);
