// Smoke for the arena bench's KEYBOARD OWNERSHIP and handle priority
// (workbench/arena.js). Three things reported from use, all real:
//
//   * Delete "did not always work". Clicking the board calls preventDefault to
//     stop the drag becoming a text selection — and preventDefault also
//     suppresses the browser's focus change, so the caret stayed in whichever
//     property field was last touched and every key after it went there. The
//     canvas takes focus explicitly now.
//   * Undo "did not work" on a width change. With the caret in a field the
//     browser takes Ctrl+Z as "undo my typing", restores the old text, and the
//     input handler writes THAT back — so the board appears to undo while the
//     bench's own history sits untouched and the two drift apart. Undo answers
//     wherever the caret is now, and preventDefaults the text undo.
//   * Grabbing a handle could reselect a neighbour that overlapped it. Once
//     something is selected, its grips own their pixels.
//
// Needs `playwright` and a Chromium binary. Start the game (node server.mjs):
//   node tools/smoke_arena_focus.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1500, height: 860 } });
const errors=[]; page.on("pageerror",e=>errors.push(String(e)));
let fails=0; const check=(ok,l,d="")=>{if(!ok){fails++;console.log(`FAIL ${l} ${d}`);}else console.log(`ok   ${l} ${d}`);};
await page.goto(`${BASE}/workbench/?edit=arena&stage=riverGate`, { waitUntil: "load" });
await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
for (let w=0;;w+=200){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.fighters.length>0))break; if(w>60000)throw new Error("no boot"); await page.waitForTimeout(200);}
await page.waitForTimeout(600);
const clientOf = (wx,wy) => page.evaluate(async ({wx,wy}) => {
  const { state } = await import("/src/state.js");
  const c = document.getElementById("arenaCanvas").getBoundingClientRect();
  const cam = state.camera;
  return { x: c.left + (((wx-cam.x)*cam.zoom+640)/1280)*c.width, y: c.top + (((wy-cam.y)*cam.zoom+360)/720)*c.height };
}, {wx,wy});
const plats = () => page.evaluate(async () => (await import("/src/state.js")).state.platforms.map((p,i)=>({i,x:p.x,y:p.y,w:p.w,h:p.h,kind:p.kind})));
const focusId = () => page.evaluate(()=>document.activeElement.tagName + (document.activeElement.id?"#"+document.activeElement.id:""));

const P = await plats();
const wall = P.find(p => p.kind === "wall");
const tier = P.find(p => p.kind === "spawn");

// --- a click on the board takes the keyboard back off a property field
let mid = await clientOf(wall.x + wall.w/2, wall.y + wall.h/2);
await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(150);
await page.click("#pW"); await page.waitForTimeout(120);
check((await focusId()) === "INPUT#pW", "a property field can take the caret");
await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(150);
check((await focusId()).startsWith("CANVAS"), "clicking the board takes it back", await focusId());

// --- so Delete removes the selection even after touching a field
const n0 = (await plats()).length;
await page.keyboard.press("Delete"); await page.waitForTimeout(250);
check((await plats()).length === n0 - 1, "Delete works after a field was touched", `${n0} -> ${(await plats()).length}`);
await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
check((await plats()).length === n0, "...and undo brings it back");

// --- undo means the BOARD, even with the caret in a field
let w2 = (await plats()).find(p => p.kind === "wall");
mid = await clientOf(w2.x + w2.w/2, w2.y + w2.h/2);
await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(150);
const wasW = w2.w;
await page.click("#pW"); await page.fill("#pW", "180"); await page.waitForTimeout(250);
check((await plats()).find(p=>p.kind==="wall").w === 180, "typing a width changes the wall", String(wasW)+" -> 180");
check((await focusId()) === "INPUT#pW", "the caret is still in the field");
await page.keyboard.press("Control+z"); await page.waitForTimeout(300);
check((await plats()).find(p=>p.kind==="wall").w === wasW,
  "Ctrl+Z from inside the field undoes the BOARD", `-> ${(await plats()).find(p=>p.kind==="wall").w}`);

// --- a selected platform's handle beats a neighbour drawn over it
await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(120);
await page.click("#addPlatform"); await page.waitForTimeout(200);      // newest index
// park the new platform exactly over the spawn tier's RIGHT handle
await page.fill("#pX", String(tier.x + tier.w - 80)); await page.waitForTimeout(120);
await page.fill("#pY", String(tier.y)); await page.waitForTimeout(200);
const decoyI = (await plats()).length - 1;
// select the TIER (lower index than the decoy) somewhere clear of it
let onTier = await clientOf(tier.x + 60, tier.y + 4);
await page.mouse.click(onTier.x, onTier.y); await page.waitForTimeout(200);
check((await page.evaluate(()=>document.getElementById("pKind").value)) === "spawn",
  "the tier can be selected", await page.evaluate(()=>document.getElementById("pKind").value));
// now grab the tier's right handle, which the decoy is sitting on top of
const before = (await plats())[tier.i];
let grip = await clientOf(before.x + before.w, before.y + 5);
let pull = await clientOf(before.x + before.w - 120, before.y + 5);
await page.mouse.move(grip.x, grip.y); await page.mouse.down();
await page.mouse.move(pull.x, pull.y, {steps:8}); await page.mouse.up();
await page.waitForTimeout(250);
const stillTier = await page.evaluate(()=>document.getElementById("pKind").value);
const afterTier = (await plats())[tier.i];
const decoy = (await plats())[decoyI];
check(stillTier === "spawn", "grabbing its handle does not reselect the neighbour on top", `kind=${stillTier}`);
check(afterTier.w < before.w, "...and the handle actually resized the selection", `${before.w} -> ${afterTier.w}`);
check(decoy && decoy.w === 210, "...leaving the neighbour untouched", decoy ? `w=${decoy.w}` : "gone");

console.log("errors:", errors.length?errors:"none");
await b.close();
console.log(fails||errors.length ? `\n${fails} check(s) failed` : "\nall arena-focus checks passed");
process.exit(fails||errors.length?1:0);
