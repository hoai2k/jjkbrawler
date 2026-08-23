// Smoke for the arena bench's LAYOUT (workbench/arena.js layoutCanvas, and the
// foldable side panels).
//
// The regression this exists for: the canvas used to fill its box and take its
// transform as `width/1280` by `height/720` — two independent scales — so any
// box that was not 16:9 quietly squashed the world. Measured before the fix, a
// 1500x860 window drew the board into a 934x707 stage: a 34% vertical stretch,
// on the one bench whose entire job is judging where a platform sits. The
// `object-fit: contain` in the stylesheet could never have helped, because the
// bitmap was always sized to match the box exactly.
//
// So the check that matters is the last one in each pass: a SQUARE in world
// space has to come out square on screen, at every window shape. The aspect
// assertions above it are the same property stated the easy way.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_arena_layout.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://127.0.0.1:5174";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server","--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
let fails = 0;
const check = (ok,l,d="") => { if(!ok){fails++;console.log(`FAIL ${l} ${d}`);} else console.log(`ok   ${l} ${d}`); };

// Several window shapes, including deliberately un-16:9 ones.
for (const vp of [{width:1500,height:860},{width:1100,height:900},{width:1800,height:700}]) {
  const page = await b.newPage({ viewport: vp });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${BASE}/workbench/?edit=arena&stage=mistPier`, { waitUntil: "load" });
  await page.waitForSelector("#arenaCanvas", { timeout: 30000 });
  for (let w=0;;w+=200){ if(await page.evaluate(async()=>(await import("/src/state.js")).state.fighters.length>0))break; if(w>60000)throw new Error("no boot"); await page.waitForTimeout(200);}
  await page.waitForTimeout(500);

  const geom = async () => page.evaluate(() => {
    const c = document.getElementById("arenaCanvas").getBoundingClientRect();
    const st = document.getElementById("arenaStage").getBoundingClientRect();
    const cv = document.getElementById("arenaCanvas");
    return { aspect: +(c.width/c.height).toFixed(4), w: Math.round(c.width), h: Math.round(c.height),
             stageW: Math.round(st.width), stageH: Math.round(st.height),
             bmpAspect: +(cv.width/cv.height).toFixed(4),
             fitsW: c.width <= st.width + 1, fitsH: c.height <= st.height + 1 };
  });
  let g = await geom();
  check(Math.abs(g.aspect - 16/9) < 0.01, `[${vp.width}x${vp.height}] the picture is 16:9`, `aspect=${g.aspect} (${g.w}x${g.h})`);
  check(g.fitsW && g.fitsH, `[${vp.width}x${vp.height}] ...and fits the space`, `stage ${g.stageW}x${g.stageH}`);
  check(Math.abs(g.bmpAspect - 16/9) < 0.01, `[${vp.width}x${vp.height}] the bitmap matches`, `bmp=${g.bmpAspect}`);

  // a world-space square must render square — the real test of "not squished"
  const sq = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const c = document.getElementById("arenaCanvas").getBoundingClientRect();
    const cam = state.camera;
    const toScreen = (wx, wy) => ({
      x: (((wx-cam.x)*cam.zoom+640)/1280)*c.width,
      y: (((wy-cam.y)*cam.zoom+360)/720)*c.height,
    });
    const a = toScreen(400, 300), bb = toScreen(600, 500);   // a 200x200 world square
    return { w: +(bb.x-a.x).toFixed(2), h: +(bb.y-a.y).toFixed(2) };
  });
  check(Math.abs(sq.w - sq.h) < 0.5, `[${vp.width}x${vp.height}] a world square draws square`, `${sq.w} x ${sq.h}`);

  if (vp.width === 1500) {
    // panels fold, and the picture grows into the space they leave
    const before = (await geom()).w;
    await page.click("#leftToggle"); await page.waitForTimeout(250);
    await page.click("#rightToggle"); await page.waitForTimeout(300);
    const after = await geom();
    check(after.w > before, "folding both panels grows the picture", `${before} -> ${after.w}`);
    check(Math.abs(after.aspect - 16/9) < 0.01, "...and it is still 16:9", `aspect=${after.aspect}`);
    const gripsVisible = await page.evaluate(() =>
      document.getElementById("leftToggle").getBoundingClientRect().width > 0 &&
      document.getElementById("rightToggle").getBoundingClientRect().width > 0);
    check(gripsVisible, "the grips stay reachable when folded");
    const listHidden = await page.evaluate(() =>
      document.getElementById("arenaList").getBoundingClientRect().width === 0);
    check(listHidden, "the folded panel's contents are gone");
    // and back
    await page.click("#leftToggle"); await page.click("#rightToggle"); await page.waitForTimeout(300);
    check((await geom()).w === before, "unfolding restores the layout", String((await geom()).w));
    // the keyboard does it too
    await page.keyboard.press("["); await page.waitForTimeout(250);
    check((await geom()).w > before, "[ folds the left panel");
    await page.keyboard.press("["); await page.waitForTimeout(250);
    // the URL carries it
    await page.click("#rightToggle"); await page.waitForTimeout(200);
    check(page.url().includes("right=off"), "the fold is remembered in the URL", page.url().split("?")[1]);
  }
  check(errors.length === 0, `[${vp.width}x${vp.height}] no page errors`, errors.slice(0,2).join(" | "));
  await page.close();
}
await b.close();
console.log(fails ? `\n${fails} failed` : "\nall layout checks passed");
process.exit(fails?1:0);
