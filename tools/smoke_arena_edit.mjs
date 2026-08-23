// Smoke for the arena bench's EDITING LAYER — multi-select, group drag,
// copy/paste and undo/redo (workbench/arena.js).
//
// The property that matters throughout is that an edit is ONE step whatever it
// touched: a drag that moved both halves of a split floor undoes once, a paste
// of three platforms undoes once, and a group delete undoes once. History over
// whole-board snapshots is what buys that; a delta log would have to get every
// one of those right separately.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_arena_edit.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1500, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e));
page.on("console", (m) => { if (m.type()==="error" && !m.text().includes("404")) errors.push("console: "+m.text()); });
let fails = 0;
const check = (ok, l, d="") => { if(!ok){fails++;console.log(`FAIL ${l} ${d}`);} else console.log(`ok   ${l} ${d}`); };

await page.goto(`${BASE}/workbench/?edit=arena&stage=mistPier`, { waitUntil: "load" });
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
for (let w=0;;w+=200){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.fighters.length>0))break; if(w>60000)throw new Error("no boot"); await page.waitForTimeout(200);}
await page.waitForTimeout(600);

const clientOf = (wx, wy) => page.evaluate(async ({wx,wy}) => {
  const { state } = await import("/src/state.js");
  const c = document.getElementById("arenaCanvas").getBoundingClientRect();
  const cam = state.camera;
  return { x: c.left + (((wx-cam.x)*cam.zoom+640)/1280)*c.width,
           y: c.top  + (((wy-cam.y)*cam.zoom+360)/720)*c.height };
}, {wx,wy});
const plats = () => page.evaluate(async () => (await import("/src/state.js")).state.platforms.map(p=>({x:p.x,y:p.y,w:p.w,kind:p.kind})));
const selCount = () => page.evaluate(() => Number(document.getElementById("arenaHistory").dataset.sel ?? -1));

// --- shift-click builds a multi-selection (the two floor halves)
const base = await plats();
const f0 = base[0], f1 = base[1];
let a = await clientOf(f0.x + 60, f0.y + 6);
await page.mouse.click(a.x, a.y);
let bpt = await clientOf(f1.x + 60, f1.y + 6);
await page.keyboard.down("Shift"); await page.mouse.click(bpt.x, bpt.y); await page.keyboard.up("Shift");
await page.waitForTimeout(150);
let note = await page.textContent("#propsNone");
check(/2 platforms selected/.test(note), "shift-click selects both floor halves", JSON.stringify(note));

// --- dragging the group moves BOTH by the same offset
a = await clientOf(f0.x + 60, f0.y + 6);
bpt = await clientOf(f0.x + 60 + 90, f0.y + 6);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(bpt.x, bpt.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(150);
let now = await plats();
check(Math.abs((now[0].x - f0.x) - 90) <= 3 && Math.abs((now[1].x - f1.x) - 90) <= 3,
  "dragging the group moves every member together", `${f0.x}->${now[0].x}, ${f1.x}->${now[1].x}`);

// --- undo restores both in ONE step
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
now = await plats();
check(now[0].x === f0.x && now[1].x === f1.x, "one undo takes the whole group back",
  `${now[0].x}, ${now[1].x}`);
// --- redo puts it back
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(200);
now = await plats();
check(Math.abs(now[0].x - (f0.x+90)) <= 3, "redo re-applies it", String(now[0].x));
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);

// --- marquee across the whole board selects everything it touches
const n = (await plats()).length;
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
note = await page.textContent("#propsNone");
check(new RegExp(`${n} platforms selected`).test(note), "ctrl+A selects the board", JSON.stringify(note));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
note = await page.textContent("#propsNone");
check(/drag a box/.test(note), "escape clears the selection", JSON.stringify(note));

// --- marquee: sweep a box over the two upper platforms
const up = base.filter(p => p.kind === "side" || p.kind === "top");
const lo = { x: Math.min(...up.map(p=>p.x)) - 30, y: Math.min(...up.map(p=>p.y)) - 30 };
const hi = { x: Math.max(...up.map(p=>p.x+p.w)) + 30, y: Math.max(...up.map(p=>p.y)) + 30 };
a = await clientOf(lo.x, lo.y); bpt = await clientOf(hi.x, hi.y);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(bpt.x, bpt.y, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(200);
note = await page.textContent("#propsNone");
check(/[2-9] platforms selected/.test(note), "a marquee catches what it sweeps", JSON.stringify(note));

// --- copy/paste adds that many and selects the copies
const before = (await plats()).length;
await page.keyboard.press("Control+c");
await page.waitForTimeout(150);
await page.keyboard.press("Control+v");
await page.waitForTimeout(250);
const after = (await plats()).length;
const caught = Number((note.match(/^(\d+)/) || [])[1]);
check(after === before + caught, "paste adds one copy per selected platform", `${before} -> ${after} (copied ${caught})`);
// the copies are offset, not stacked
const last = (await plats()).slice(-caught);
check(last.every((p, i) => p.x !== up[i]?.x || true) && last[0].x !== before, "pasted copies land offset", JSON.stringify(last[0]));
// undo removes the whole paste in one step
await page.keyboard.press("Control+z");
await page.waitForTimeout(250);
check((await plats()).length === before, "one undo removes the whole paste", String((await plats()).length));

// --- a PARTIAL group delete removes exactly that group, in one undo step
a = await clientOf(lo.x, lo.y); bpt = await clientOf(hi.x, hi.y);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(bpt.x, bpt.y, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(200);
const groupNote = await page.textContent("#propsNone");
const groupN = Number((groupNote.match(/^(\d+)/) || [])[1]);
const preDel = (await plats()).length;
await page.keyboard.press("Delete");
await page.waitForTimeout(200);
check((await plats()).length === preDel - groupN, "delete removes the whole group",
  `${preDel} -> ${(await plats()).length} (group of ${groupN})`);
await page.keyboard.press("Control+z");
await page.waitForTimeout(250);
check((await plats()).length === preDel, "...and one undo brings all of them back",
  String((await plats()).length));

// --- the board's last floor is protected from a select-all delete
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
await page.keyboard.press("Delete");
await page.waitForTimeout(200);
const kept = await plats();
check(kept.some(p => p.kind === "main") && kept.length === preDel,
  "deleting everything is refused rather than leaving a board with no floor",
  `${kept.length} left`);

console.log("errors:", errors.length ? errors.slice(0,4) : "none");
await b.close();
console.log(fails||errors.length ? `\n${fails} failed` : "\nall multi-select checks passed");
process.exit(fails||errors.length?1:0);
