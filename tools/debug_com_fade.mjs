// WHAT THE SMOOTHING FLAGS ACTUALLY DO TO THE PICTURE.
//
// `?smooth=com` and `?smooth=holds` (src/flags.js) are look changes, and a look
// change is judged by looking. But "does it read as one body moving" has a
// measurable half underneath it: where the drawn body's weight SITS, frame by
// frame, across a cut. An unaligned cross-fade moves that point in one step —
// two drawings carrying their mass in different places, dissolving into each
// other — and an aligned one slides it.
//
// So this renders the real game (src/render.js, the real fighters, the real
// stage) at 60 Hz through a cut, isolates the fighter by diffing against a
// plate drawn without them, and prints the alpha-weighted centroid of what is
// on screen. Run with and without the flags and compare the biggest one-frame
// jump in that trace.
//
// It is a probe, not a check: it prints numbers and asserts nothing. The number
// it prints is not the whole question either — a fade can be measurably
// smoother and still look like a ghost — which is why the flags ship dark and a
// person decides.
//
// Usage: node tools/debug_com_fade.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const argv = process.argv.slice(2);
const filmAt = argv.indexOf("--film");
/** `--film <path>` and its value are options, not the base URL. */
const film = filmAt > -1 ? (argv[filmAt + 1] || "com-fade.png") : null;
const BASE = argv.filter((a, i) => i !== filmAt && i !== filmAt + 1)[0]
  || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

/** One boot, one character, one trace per case. */
async function trace(query, char, from, to, film) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
  await page.goto(`${BASE}/?camera=flat${query}`);
  await pressStart(page);
  await page.click(`[data-character="${char}"]`);
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 20000 });
  await page.locator(".stage-card").nth(0).click();
  for (let w = 0; ; w += 200) {
    const ok = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return state.phase === "playing" && state.fighters.length > 1;
    });
    if (ok) break;
    if (w > 120000) throw new Error("match never started");
    await page.waitForTimeout(200);
  }

  const out = await page.evaluate(async ({ FROM, TO, FILM }) => {
    const { state } = await import("/src/state.js");
    const { draw } = await import("/src/render.js");
    const { WORLD } = await import("/src/constants.js");

    const cv = new OffscreenCanvas(WORLD.w, WORLD.h);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const a = state.fighters[0];
    const main = state.platforms.find((p) => p.kind === "main");
    for (const f of state.fighters) { f.aiState = null; f.stocks = 99; f.invuln = 0; }
    state.fighters[1].dead = true;

    // A still fighter on a still stage: everything that moves on its own would
    // land in the diff as if it were the body.
    const settle = () => Object.assign(a, {
      x: main.x + main.w / 2, y: main.y, vx: 0, vy: 0, grounded: true,
      hitstun: 0, action: null, dead: false, respawnTimer: 0, ledge: null,
      ledgeMove: null, shakeMag: 0, teeterT: 0, teeterDir: 0,
    });
    settle();
    state.particles = [];

    const shot = () => {
      state.particles = [];
      ctx.clearRect(0, 0, WORLD.w, WORLD.h);
      draw(ctx);
      return ctx.getImageData(0, 0, WORLD.w, WORLD.h).data;
    };

    // The stage without the fighter on it. Everything else in the frame is the
    // same in both, so what survives the diff is the body.
    a.dead = true;
    const plate = shot();
    a.dead = false;

    /** Alpha-weighted centroid, in world px, of whatever differs from the
     *  plate — and how much of it there is, so a frame that drew nothing is
     *  visible as such rather than reported as a centroid of zero. */
    const centroid = () => {
      const px = shot();
      let sum = 0, wx = 0;
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.abs(px[i] - plate[i]) + Math.abs(px[i + 1] - plate[i + 1])
          + Math.abs(px[i + 2] - plate[i + 2]);
        if (d < 24) continue;
        const x = (i / 4) % WORLD.w;
        sum += d; wx += d * x;
      }
      return sum > 0 ? { x: wx / sum, mass: sum } : { x: null, mass: 0 };
    };

    const run = (setup, times) => {
      const rows = [];
      for (const t of times) { setup(t); rows.push({ t: +t.toFixed(4), ...centroid() }); }
      return rows;
    };

    const dt = 1 / 60;
    // Only the fade window, and one frame of the OLD pose in front of it. The
    // seam is between those first two samples — that is the cut — and a window
    // any wider starts measuring the next thing the state does on its own: a
    // 6 fps attack steps to its second drawing at 0.167s, which is a bigger
    // move than anything here and has nothing to do with the fade.
    const span = Math.ceil(0.08 / dt) + 1;
    const times = Array.from({ length: span }, (_, i) => i * dt);

    // 1. A STATE CHANGE, which is where two poses carry their weight in
    //    different places. The pair is an argument so this can be pointed at
    //    the transitions that actually move a body — most do not.
    const change = [{ t: -dt, ...(settle(), a.animKey = FROM, a.prevAnim = null,
      a.animTime = 0.3, centroid()) }].concat(run((t) => {
      settle();
      a.animKey = TO;
      a.animTime = t;
      a.prevAnim = { key: FROM, t: 0.3 + t };
    }, times));

    // 2. A FRAME STEP inside a slow hold — idle_a to idle_b at 2.2 fps, with
    //    the window opening on the step.
    const step0 = 1 / 2.2;
    const step = [{ t: -dt, ...(settle(), a.animKey = "idle", a.prevAnim = null,
      a.animTime = step0 - dt, centroid()) }].concat(run((t) => {
      settle();
      a.animKey = "idle";
      a.prevAnim = null;
      a.animTime = step0 + t;
    }, times));

    /** The biggest one-frame move in a trace: the jump a fade is there to
     *  remove. */
    const worst = (rows) => {
      let max = 0;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].x == null || rows[i - 1].x == null) continue;
        max = Math.max(max, Math.abs(rows[i].x - rows[i - 1].x));
      }
      return +max.toFixed(2);
    };

    // A strip of the fade itself, cropped around the body, for the half of
    // this question numbers cannot answer.
    const CROP = { w: 260, h: 320 };
    const strip = [];
    if (FILM) {
      const cx = Math.round(change[0].x ?? WORLD.w / 2);
      for (const t of [-dt, ...times]) {
        settle();
        if (t < 0) { a.animKey = FROM; a.prevAnim = null; a.animTime = 0.3; }
        else { a.animKey = TO; a.animTime = t; a.prevAnim = { key: FROM, t: 0.3 + t }; }
        state.particles = [];
        ctx.clearRect(0, 0, WORLD.w, WORLD.h);
        draw(ctx);
        const cut = new OffscreenCanvas(CROP.w, CROP.h);
        cut.getContext("2d").drawImage(cv, cx - CROP.w / 2, WORLD.h - CROP.h - 40,
          CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
        const blob = await cut.convertToBlob();
        strip.push(await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(blob);
        }));
      }
    }

    return {
      change: { worst: worst(change), trace: change.map((r) => (r.x == null ? null : +r.x.toFixed(1))) },
      step: { worst: worst(step), trace: step.map((r) => (r.x == null ? null : +r.x.toFixed(1))) },
      strip,
    };
  }, { FROM: from, TO: to, FILM: film });

  await page.close();
  return out;
}

// Pick a transition whose two poses really do carry their weight in different
// places — `node tools/audit_sprite_com.mjs --swings` lists them. Most
// transitions move it by a pixel or two, and measuring one of those says
// nothing about either flag.
const char = process.env.CHAR || "uro";
const from = process.env.FROM || "idle";
const to = process.env.TO || "upHeavy";
const cases = [
  ["off        ", ""],
  ["smooth=com ", "&smooth=com"],
  ["smooth=all ", "&smooth=all"],
];

// `--film <path.png>` also writes a filmstrip of the cut: one row per case,
// one column per 60 Hz frame, starting on the last frame of the old pose. The
// numbers say the mass stopped stepping; this says whether the result looks
// like a body or like a double exposure, which is the actual question.
console.log(`centroid of the drawn body, world px — ${char}, ${from} -> ${to}`);
console.log("the cut is between the first two samples; worst = biggest one-frame move\n");
const strips = [];
for (const [label, query] of cases) {
  const r = await trace(query, char, from, to, !!film);
  console.log(`${label}  state change  worst ${String(r.change.worst).padStart(6)}   ${r.change.trace.join(" ")}`);
  console.log(`${label}  frame step    worst ${String(r.step.worst).padStart(6)}   ${r.step.trace.join(" ")}`);
  if (film) strips.push({ label: label.trim(), frames: r.strip });
}

if (film) {
  const { writeFile } = await import("fs/promises");
  const page = await browser.newPage();
  const data = await page.evaluate(async (rows) => {
    const W = 260, H = 320, PAD = 26;
    const cols = rows[0].frames.length;
    const cv = new OffscreenCanvas(W * cols, (H + PAD) * rows.length);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0d1018";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        const img = new Image();
        img.src = rows[r].frames[c];
        await img.decode();
        ctx.drawImage(img, c * W, r * (H + PAD) + PAD);
      }
      ctx.fillStyle = "#cfe3ff";
      ctx.font = "16px system-ui";
      ctx.fillText(rows[r].label, 8, r * (H + PAD) + 18);
    }
    const blob = await cv.convertToBlob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }, strips);
  await writeFile(film, Buffer.from(String(data).split(",")[1], "base64"));
  console.log(`\nfilmstrip -> ${film}`);
}

await browser.close();
