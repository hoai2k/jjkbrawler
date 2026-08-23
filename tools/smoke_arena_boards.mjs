// Smoke for the arena bench holding EDITS ACROSS BOARDS (workbench/arena.js).
//
// Reported from use: an afternoon's work on one board vanished the moment you
// looked at another, and a copy taken on one board had nothing to paste after
// you moved. Switching used to rebuild the new board from the shipped table,
// throw the old one away, and clear the clipboard on the way past.
//
// Each board now keeps its own arena and its own undo stacks, the clipboard is
// global on purpose, and the export carries every changed board at once.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_arena_boards.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
let fails = 0;
const check = (ok, l, d = "") => { if (!ok) { fails++; console.log(`FAIL ${l} ${d}`); } else console.log(`ok   ${l} ${d}`); };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1500, height: 860 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e));
page.on("console", m => { if (m.type()==="error" && !m.text().includes("404")) errors.push("console: "+m.text()); });
await page.goto(`${BASE}/workbench/?edit=arena&stage=billboardRoof`, { waitUntil: "load" });
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
const ready = async () => { for (let w=0;;w+=200){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.fighters.length>0))break; if(w>60000)throw new Error("x"); await page.waitForTimeout(200);} await page.waitForTimeout(500); };
await ready();
const clientOf = (wx,wy) => page.evaluate(async ({wx,wy}) => {
  const { state } = await import("/src/state.js");
  const c = document.getElementById("arenaCanvas").getBoundingClientRect();
  const cam = state.camera;
  return { x: c.left + (((wx-cam.x)*cam.zoom+640)/1280)*c.width, y: c.top + (((wy-cam.y)*cam.zoom+360)/720)*c.height };
}, {wx,wy});
const plats = () => page.evaluate(async () => (await import("/src/state.js")).state.platforms.map(p=>({x:p.x,y:p.y,w:p.w,kind:p.kind})));

// 1. edit Billboard Roof: drag its first floor half 120px right
const before = await plats();
let a = await clientOf(before[0].x + 60, before[0].y + 6);
let c2 = await clientOf(before[0].x + 180, before[0].y + 6);
await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(c2.x,c2.y,{steps:8}); await page.mouse.up();
await page.waitForTimeout(200);
const edited = (await plats())[0].x;
check(edited === before[0].x + 120, "a board can be edited", `${before[0].x} -> ${edited}`);

// 2. switch to Empty City
await page.click('[data-stage="emptyCity"]');
await ready();
const ec = await plats();
// click a platform there, then copy+paste
let pt = await clientOf(ec[0].x + 60, ec[0].y + 6);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(200);
check(!(await page.evaluate(() => document.getElementById("propsBody").hidden)),
  "clicking selects on a board you switched to");
const n0 = (await plats()).length;
await page.keyboard.press("Control+c"); await page.waitForTimeout(150);
const flash1 = await page.textContent("#arenaOverlay");
await page.keyboard.press("Control+v"); await page.waitForTimeout(250);
const n1 = (await plats()).length;
check(n1 > n0, "copy and paste work on the board you switched to", `${n0} -> ${n1}`);

// 3. back to Billboard Roof — is the edit still there?
await page.click('[data-stage="billboardRoof"]');
await ready();
const back = (await plats())[0].x;
check(back === edited, "edits survive leaving the board and coming back", `${back} (edited to ${edited})`);
// 4. cross-board copy/paste: copy here, paste on another board
let cp = await clientOf((await plats())[3].x + 40, (await plats())[3].y + 4);
await page.mouse.click(cp.x, cp.y);
await page.keyboard.press("Control+c");
await page.waitForTimeout(150);
await page.click('[data-stage="quietHall"]');
await ready();
const qh0 = (await plats()).length;
await page.keyboard.press("Control+v");
await page.waitForTimeout(250);
const qh1 = (await plats()).length;
check(qh1 > qh0, "the clipboard crosses boards", `${qh0} -> ${qh1}`);

// 5. undo on a board you came back to undoes THAT board's last edit
await page.click('[data-stage="billboardRoof"]');
await ready();
const beforeUndo = (await plats())[0].x;
await page.keyboard.press("Control+z");
await page.waitForTimeout(250);
const afterUndo = (await plats())[0].x;
check(afterUndo !== beforeUndo, "undo after returning uses that board\u2019s own history", `${beforeUndo} -> ${afterUndo}`);

// 6. export carries every changed board
const [dl] = await Promise.all([ page.waitForEvent("download", { timeout: 15000 }), page.click("#arenaExport") ]);
const st = await dl.createReadStream(); let raw = ""; for await (const c of st) raw += c;
const j = JSON.parse(raw);
check(j.boards.length === 2 && dl.suggestedFilename() === "arenas-2-boards.json",
  "the export carries every changed board", `${dl.suggestedFilename()} [${j.boards.map(x=>x.key).join(", ")}]`);
// Each board's entry is itself several lines, so count the entries rather than
// the newlines.
check((j.stagesJs.match(/key: "/g) || []).length === 2 &&
      j.boards.every((bd) => j.stagesJs.includes(`key: "${bd.key}"`)),
  "...with a paste-ready stages.js entry for each");
check(/Export 2 boards/.test(await page.textContent("#arenaExport")),
  "the button says how much work is waiting");
check(await page.evaluate(() => document.querySelectorAll(".arena.is-edited").length) === 2,
  "and the list marks which boards were touched");
console.log("errors:", errors.length ? errors : "none");
await b.close();
console.log(fails || errors.length ? `\n${fails} check(s) failed` : "\nall arena-boards checks passed");
process.exit(fails || errors.length ? 1 : 0);
