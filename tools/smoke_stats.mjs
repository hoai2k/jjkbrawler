// /stats/ and the counter that feeds it, checked from a real browser.
//
// This corner has an unusual failure mode: it can be broken and look fine.
// A counter that never fires and a game nobody plays produce the same empty
// dashboard, and a /stats/ page that renders nothing at all still renders
// nothing at all. So the assertions here are about the two states being
// distinguishable — off says off, on points at the right endpoint — rather
// than about numbers, which only the live site has.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/smoke_stats.mjs [baseUrl]
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "src/config_stats.js");
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

const original = readFileSync(CONFIG, "utf8");
/** Run `body` with GOATCOUNTER_SITE temporarily set to `code`.
 *
 *  The file is put back in a finally, including on a thrown assertion: a smoke
 *  test that leaves a fake site code committed would send real visits to a
 *  subdomain we do not own, which is worse than any bug it could catch. */
async function withSite(code, body) {
  const decl = /export const GOATCOUNTER_SITE = "[^"]*";/;
  if (!decl.test(original)) throw new Error("could not find GOATCOUNTER_SITE in config_stats.js");
  const patched = original.replace(decl, `export const GOATCOUNTER_SITE = "${code}";`);
  writeFileSync(CONFIG, patched);
  try { await body(); } finally { writeFileSync(CONFIG, original); }
}

const page = await browser.newPage();

// Off: /stats/ must say so in words, and must not show a frame. An empty
// dashboard here would be a lie about history that was never recorded.
await withSite("", async () => {
  await page.goto(`${BASE}/stats/`, { waitUntil: "load" });
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ({
    text: document.getElementById("mount")?.textContent || "",
    frames: document.querySelectorAll("iframe").length,
  }));
  ok(/not switched on/i.test(got.text), "unconfigured: /stats/ says it is off");
  ok(/goatcounter\.com\/signup|config_stats\.js/i.test(got.text),
     "unconfigured: /stats/ gives the setup steps");
  ok(got.frames === 0, "unconfigured: no dashboard frame", `${got.frames} frame(s)`);
});

// On: the frame and the link point at that code's dashboard, and the game page
// asks for count.js against that code's endpoint. The request is intercepted
// rather than allowed out — a smoke run must not put pageviews in anyone's
// dashboard, and the assertion is about the URL we send, not their reply.
await withSite("smoketest", async () => {
  await page.goto(`${BASE}/stats/`, { waitUntil: "load" });
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ({
    frame: document.querySelector("iframe")?.getAttribute("src") || "",
    link: [...document.querySelectorAll("#mount a")].map((a) => a.href).join(" "),
  }));
  ok(got.frame.startsWith("https://smoketest.goatcounter.com"), "configured: frame is the dashboard", got.frame);
  ok(got.link.includes("https://smoketest.goatcounter.com"), "configured: direct link to the dashboard");

  const asked = [];
  const counted = await browser.newPage();
  await counted.route("**://gc.zgo.at/**", (route) => {
    asked.push(route.request().url());
    // An empty body: count.js never runs, so nothing is ever sent onward.
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  await counted.goto(`${BASE}/`, { waitUntil: "load" });
  await counted.waitForTimeout(1200);
  const endpoint = await counted.evaluate(() =>
    document.querySelector("script[data-goatcounter]")?.dataset.goatcounter || "");
  ok(asked.length === 1, "game page fetches count.js once", `${asked.length} request(s)`);
  ok(endpoint === "https://smoketest.goatcounter.com/count",
     "game page points count.js at the configured endpoint", endpoint);
  await counted.close();
});

// A pasted URL instead of a code is the likeliest mistake, and the one that
// fails invisibly: the endpoint becomes nonsense and every visit 404s with
// nothing on screen. It must refuse loudly and count nothing.
await withSite("https://x.goatcounter.com/count", async () => {
  const errors = [];
  const bad = await browser.newPage();
  bad.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  let requested = 0;
  await bad.route("**://gc.zgo.at/**", (route) => { requested++; route.abort(); });
  await bad.goto(`${BASE}/`, { waitUntil: "load" });
  await bad.waitForTimeout(1000);
  ok(requested === 0, "malformed code: nothing is sent", `${requested} request(s)`);
  ok(errors.some((e) => /not a GoatCounter code/i.test(e)), "malformed code: says why in the console");
  await bad.close();
});

await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
