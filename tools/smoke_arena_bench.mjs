// Smoke for the ARENA BENCH (/workbench/?edit=arena, workbench/arena.js): boots
// it in headless Chromium and drives the editing layer with a real mouse —
// select, move, resize from either edge, add, delete — then exports and checks
// what came out.
//
// The export check is the one that matters most. `stages.js` multiplies every
// platform's thickness by ART_SCALE in place, so the live table's `h` is NOT
// the authored number; a bench that round-tripped the runtime value would
// shave 30% off every slab each time somebody used it. The bench edits
// AUTHORED_STAGES for exactly that reason, and this asserts it: a main
// platform must come out as h 42 while the world is running it at 29.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_arena_bench.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push("console: " + m.text()); });

let fails = 0;
const check = (ok, label, detail = "") => {
  if (!ok) { fails++; console.log(`FAIL ${label} ${detail}`); }
  else console.log(`ok   ${label} ${detail}`);
};

await page.goto(`${BASE}/workbench/?edit=arena&stage=trainingBridge`, { waitUntil: "load" });
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
for (let w = 0; ; w += 200) {
  if (await page.evaluate(async () => (await import("/src/state.js")).state.fighters.length > 0)) break;
  if (w > 60000) throw new Error("no boot");
  await page.waitForTimeout(200);
}
await page.waitForTimeout(600);

// world -> client, through the live camera
async function clientOf(wx, wy) {
  return page.evaluate(async ({ wx, wy }) => {
    const { state } = await import("/src/state.js");
    const c = document.getElementById("arenaCanvas").getBoundingClientRect();
    const cam = state.camera;
    const ux = (wx - cam.x) * cam.zoom + 640;
    const uy = (wy - cam.y) * cam.zoom + 360;
    return { x: c.left + (ux / 1280) * c.width, y: c.top + (uy / 720) * c.height };
  }, { wx, wy });
}
const plats = () => page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return state.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, kind: p.kind }));
});

// --- select the main platform by clicking its middle
let before = await plats();
const main = before[0];
let pt = await clientOf(main.x + main.w / 2, main.y + 4);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(150);
const selName = await page.evaluate(() => ({
  hidden: document.getElementById("propsBody").hidden,
  x: document.getElementById("pX").value,
  kind: document.getElementById("pKind").value,
}));
check(!selName.hidden && selName.kind === "main" && Number(selName.x) === main.x,
  "click selects the platform under the cursor", JSON.stringify(selName));

// --- drag it 100 world px right
let a = await clientOf(main.x + main.w / 2, main.y + 4);
let b = await clientOf(main.x + main.w / 2 + 100, main.y + 4);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(150);
let after = await plats();
check(Math.abs(after[0].x - (main.x + 100)) <= 2, "dragging the body moves it",
  `x ${main.x} -> ${after[0].x}`);

// --- drag the RIGHT edge handle to widen by 80
const cur = after[0];
a = await clientOf(cur.x + cur.w, cur.y + cur.h / 2);
b = await clientOf(cur.x + cur.w + 80, cur.y + cur.h / 2);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(150);
after = await plats();
check(Math.abs(after[0].w - (cur.w + 80)) <= 3 && after[0].x === cur.x,
  "the right handle scales it horizontally", `w ${cur.w} -> ${after[0].w}, x held at ${after[0].x}`);

// --- left handle keeps the right edge put
const cur2 = after[0];
const rightEdge = cur2.x + cur2.w;
a = await clientOf(cur2.x, cur2.y + cur2.h / 2);
b = await clientOf(cur2.x + 60, cur2.y + cur2.h / 2);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(150);
after = await plats();
check(Math.abs((after[0].x + after[0].w) - rightEdge) <= 3,
  "the left handle pins the right edge", `right edge ${rightEdge} -> ${after[0].x + after[0].w}`);

// --- add a platform
const n0 = (await plats()).length;
await page.click("#addPlatform");
await page.waitForTimeout(150);
check((await plats()).length === n0 + 1, "+ platform adds one", `${n0} -> ${(await plats()).length}`);

// --- delete it with the Delete key
await page.keyboard.press("Delete");
await page.waitForTimeout(150);
check((await plats()).length === n0, "Delete removes the selected one", `-> ${(await plats()).length}`);

// --- the last main cannot be deleted
pt = await clientOf(after[0].x + after[0].w / 2, after[0].y + 4);
await page.mouse.click(pt.x, pt.y);
await page.keyboard.press("Delete");
await page.waitForTimeout(150);
const stillMain = (await plats()).filter((p) => p.kind === "main").length;
check(stillMain === 1, "the only main platform is protected", `mains=${stillMain}`);

// --- editing off hands the camera back to the game
await page.uncheck("#editingToggle");
await page.waitForTimeout(1200);
const camPlay = await page.evaluate(async () => (await import("/src/state.js")).state.camera.zoom);
check(Math.abs(camPlay - 0.78) > 0.01, "editing off gives the game camera back", `zoom=${camPlay.toFixed(3)}`);
await page.check("#editingToggle");
await page.waitForTimeout(400);
const camEdit = await page.evaluate(async () => (await import("/src/state.js")).state.camera.zoom);
check(Math.abs(camEdit - 0.78) < 0.001, "editing on re-pins it at the furthest shot", `zoom=${camEdit.toFixed(3)}`);

// --- EXPORT: authored thickness must survive the round trip (42, not 29)
await page.goto(`${BASE}/workbench/?edit=arena&stage=sunkenCrossing`, { waitUntil: "load" });
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
for (let w = 0; ; w += 200) {
  if (await page.evaluate(async () => (await import("/src/state.js")).state.fighters.length > 0)) break;
  if (w > 60000) throw new Error("no boot 2");
  await page.waitForTimeout(200);
}
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }),
  page.click("#arenaExport"),
]);
const stream = await dl.createReadStream();
let raw = "";
for await (const c of stream) raw += c;
const json = JSON.parse(raw);
const exportedMain = json.platforms.find((p) => p.kind === "main");
const runtimeH = await page.evaluate(async () => (await import("/src/state.js")).state.platforms[0].h);
check(exportedMain.h === 42 && runtimeH === 29,
  "export writes AUTHORED thickness, not the scaled one", `exported h=${exportedMain.h}, runtime h=${runtimeH}`);
check(exportedMain.x === -140 && exportedMain.w === 1560,
  "export matches the shipped geometry", `x=${exportedMain.x} w=${exportedMain.w}`);
check(json.stagesJs.includes('key: "sunkenCrossing"') && json.stagesJs.includes('h: 42'),
  "export carries a paste-ready stages.js line");
check(json.mods && json.mods.frictionPow === 0.35, "export carries the board's mods",
  JSON.stringify(json.mods));
check(dl.suggestedFilename() === "arena-sunkenCrossing.json", "download is named for the board",
  dl.suggestedFilename());

console.log("\nerrors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
console.log(fails || errors.length ? `\n${fails} check(s) failed` : "\nall arena bench checks passed");
process.exit(fails || errors.length ? 1 : 0);
