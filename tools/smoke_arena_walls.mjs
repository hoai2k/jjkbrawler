// Smoke for the arena bench's WALL HANDLES (workbench/arena.js pick/edgeGrab).
//
// Two things reported from use, both real:
//
//   * a wall could not be dragged TALLER — there was no vertical handle at all,
//     only the two horizontal ones, and a wall's height is its reach
//   * a narrow wall could not be PICKED UP. The two edge grab zones are a fixed
//     margin wide, and on a 30px wall at editing zoom they are 14.1px each —
//     which leaves a 1.8px band in the middle where "move" answers. Every
//     attempt landed on a resize instead, and making the wall taller only gave
//     you more of the wrong thing to hit.
//
// So the edge zones are capped at a quarter of the width, which reserves half
// the platform for the body at any size and any zoom.
//
// Needs `playwright` and a Chromium binary. Start the game (node server.mjs):
//   node tools/smoke_arena_walls.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1500, height: 860 } });
const errors=[]; page.on("pageerror",e=>errors.push(String(e)));
let fails=0; const check=(ok,l,d="")=>{if(!ok){fails++;console.log(`FAIL ${l} ${d}`);}else console.log(`ok   ${l} ${d}`);};
await page.goto(`${BASE}/workbench/?edit=arena&stage=riverGate`, { waitUntil: "load" });   // has 30px walls
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
for (let w=0;;w+=200){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.fighters.length>0))break; if(w>60000)throw new Error("x"); await page.waitForTimeout(200);}
await page.waitForTimeout(600);
const clientOf = (wx,wy) => page.evaluate(async ({wx,wy}) => {
  const { state } = await import("/src/state.js");
  const c = document.getElementById("arenaCanvas").getBoundingClientRect();
  const cam = state.camera;
  return { x: c.left + (((wx-cam.x)*cam.zoom+640)/1280)*c.width, y: c.top + (((wy-cam.y)*cam.zoom+360)/720)*c.height };
}, {wx,wy});
const walls = () => page.evaluate(async () => (await import("/src/state.js")).state.platforms
  .map((p,i)=>({i,...p})).filter(p=>p.kind==="wall").map(p=>({i:p.i,x:p.x,y:p.y,w:p.w,h:p.h})));

const w0 = (await walls())[0];
console.log("wall:", JSON.stringify(w0));

// select it by clicking its MIDDLE — the band that used to be 1.8px wide
let pt = await clientOf(w0.x + w0.w/2, w0.y + w0.h/2);
await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(120);
const cur = await page.evaluate(() => document.getElementById("arenaCanvas").style.cursor);
check(cur === "move", "the middle of a 30px wall offers MOVE", `cursor=${cur}`);
await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(150);

// drag it sideways from that middle band
let to = await clientOf(w0.x + w0.w/2 + 90, w0.y + w0.h/2);
await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, {steps:8}); await page.mouse.up();
await page.waitForTimeout(200);
let now = (await walls())[0];
check(Math.abs(now.x - (w0.x + 90)) <= 3, "...and a narrow wall can be dragged by it", `${w0.x} -> ${now.x}`);

// now the height grip at the bottom edge
const h0 = now.h;
let bot = await clientOf(now.x + now.w/2, now.y + now.h);
await page.mouse.move(bot.x, bot.y); await page.waitForTimeout(120);
const cur2 = await page.evaluate(() => document.getElementById("arenaCanvas").style.cursor);
check(cur2 === "ns-resize", "the wall's bottom edge offers a HEIGHT grip", `cursor=${cur2}`);
let taller = await clientOf(now.x + now.w/2, now.y + now.h + 120);
await page.mouse.move(bot.x, bot.y); await page.mouse.down(); await page.mouse.move(taller.x, taller.y, {steps:8}); await page.mouse.up();
await page.waitForTimeout(200);
let tall = (await walls())[0];
check(tall.h > h0 + 100, "dragging it makes the wall taller", `h ${h0} -> ${tall.h}`);
check(tall.y === now.y, "...without moving its top surface", `y ${now.y} -> ${tall.y}`);

// and a VERY tall wall can still be picked up and moved
const pt2 = await clientOf(tall.x + tall.w/2, tall.y + tall.h/2);
await page.mouse.move(pt2.x, pt2.y); await page.waitForTimeout(120);
const cur3 = await page.evaluate(() => document.getElementById("arenaCanvas").style.cursor);
check(cur3 === "move", "a very tall wall still offers MOVE", `cursor=${cur3} (h=${tall.h})`);
const to2 = await clientOf(tall.x + tall.w/2 - 70, tall.y + tall.h/2);
await page.mouse.move(pt2.x, pt2.y); await page.mouse.down(); await page.mouse.move(to2.x, to2.y, {steps:8}); await page.mouse.up();
await page.waitForTimeout(200);
const moved = (await walls())[0];
check(Math.abs(moved.x - (tall.x - 70)) <= 3, "...and can still be dragged", `${tall.x} -> ${moved.x}`);
console.log("errors:", errors.length?errors:"none");
await b.close();
console.log(fails||errors.length ? `\n${fails} check(s) failed` : "\nall wall-handle checks passed");
process.exit(fails||errors.length?1:0);
