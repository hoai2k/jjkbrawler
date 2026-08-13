// Smoke the 3D workbench's IDLE REVIEW — the full-screen, one-fighter-at-a-
// time pass that judges each model's idle against its own idle sprite (size,
// stance, facing) and produces the adjustment payload.
//
// It is driven on a PHONE viewport, because that is what it is for and
// because every failure it has had so far was a layout failure: an entry
// point buried behind a panel tab, a figure eighty pixels tall, a control row
// that wrapped, a reference sprite clipped off the side of the screen. None
// of those throw; they just make the tool useless, and only a real viewport
// shows them.
//
// Needs `playwright` with WebKit installed; start the game first
// (node server.mjs), then: node tools/smoke_idle_review.mjs [baseUrl]
import { chromium, webkit, devices } from "playwright";

// Flags and the base URL share argv; take the first non-flag.
const BASE = process.argv.slice(2).find((a) => !a.startsWith("--"))
  || "http://127.0.0.1:5174";
const PHONE = { width: 390, height: 844 };

// WEBKIT BY DEFAULT, because the bug this test now guards was invisible to
// Chromium. A phone-sized Chromium window is not a phone: the workbench
// booted fine there while an actual iPhone ran out of memory loading
// twenty-seven models, never finished its module, and presented a fully
// drawn page on which nothing at all worked. Same engine as Safari or the
// test does not cover the device the tool is for. Pass --chromium to
// cross-check the other engine.
const useChromium = process.argv.includes("--chromium");
const browser = useChromium
  ? await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
  })
  : await webkit.launch();
console.log(`engine: ${useChromium ? "chromium" : "webkit (Safari)"}`);

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const context = useChromium
  ? await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  : await browser.newContext({ ...devices["iPhone 13"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
// Every model the page pulls, so the boot cost is measured rather than
// assumed — see the eager-load note below.
let glbCount = 0, glbBytes = 0;
page.on("response", async (r) => {
  if (!r.url().endsWith(".glb")) return;
  glbCount++;
  try { glbBytes += (await r.body()).length; } catch { /* body gone */ }
});

const t0 = Date.now();
await page.goto(`${BASE}/render3d/workbench/index.html?char=gakuganji&state=idle`,
  { waitUntil: "load" });
let booted = true;
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 })
  .catch(() => { booted = false; });
const bootSecs = (Date.now() - t0) / 1000;

check(booted, "the module finishes booting on a phone", `${bootSecs.toFixed(1)}s`);
// THE regression guard. The workbench used to fetch every approved delivery
// before wiring a single control: 27 models, 56 MB. That is what killed it on
// an iPhone, and nothing about it looked like a failure — the page rendered,
// and every button did nothing.
check(glbCount <= 3, "boot loads one fighter, not the whole roster",
  `${glbCount} model(s), ${(glbBytes / 1e6).toFixed(1)} MB in ${bootSecs.toFixed(1)}s`);
check(await page.evaluate(() => document.getElementById("bootError").hidden),
  "no boot failure was reported");

// The way in has to be reachable without opening anything first.
check(await page.isVisible("#facingReviewTop"),
  "the way in is visible on a phone without opening a panel");
check((await page.textContent("#facingReviewTop")).includes("Idle Review"),
  "...and it is called what it does", (await page.textContent("#facingReviewTop")).trim());

await page.click("#facingReviewTop");
await page.waitForTimeout(2600);

const open = await page.evaluate(() => {
  const o = document.getElementById("facingOverlay");
  const c = document.querySelector("#facingStage canvas");
  const r = c?.getBoundingClientRect();
  const foot = document.querySelector("#facingOverlay footer").getBoundingClientRect();
  return {
    visible: !o.hidden,
    borrowedCanvas: !!c,
    canvasH: r ? Math.round(r.height) : 0,
    stageH: Math.round(document.getElementById("facingStage").getBoundingClientRect().height),
    footTop: Math.round(foot.top),
    winH: innerHeight,
    name: document.getElementById("facingName").textContent,
    progress: document.getElementById("facingProgress").textContent,
    scale: document.getElementById("facingScaleVal").textContent,
    stance: document.getElementById("facingStanceVal").textContent,
    yaw: document.getElementById("facingYawVal").textContent,
  };
});
check(open.visible && open.borrowedCanvas,
  "it opens full screen with the real viewer canvas moved into it");
// The FIGURES have to be big enough to compare, which is not the same as the
// canvas filling its box. The facing pass cropped the stage sideways so one
// fighter could fill the height; this pass must show the stage WHOLE, because
// the sprite stands off to the left and cropping is what threw it off screen
// last time. So the thing to hold is the figure, measured on the canvas.
const figure = await page.evaluate(() => {
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const x0 = Math.round(c.width * 0.5);
  const d = ctx.getImageData(x0, 0, c.width - x0, c.height).data;
  const w = c.width - x0;
  let top = -1, bot = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < w; x++) {
      if (d[((y * w) + x) * 4 + 3] > 90) { if (top < 0) top = y; bot = y; break; }
    }
  }
  return { h: bot - top, canvas: c.height };
});
check(figure.h > figure.canvas * 0.45, "the model fills enough of the frame to judge",
  `${figure.h}px of ${figure.canvas}px`);
check(/\d+ \/ \d+/.test(open.progress),
  "it says where you are in the roster", open.progress);

// Every control on one screen, none wrapped off the bottom.
// VISIBLE controls only. The phone layout shows one dial at a time and hides
// the rest, and a hidden element measures 0x0 — so measuring everything in the
// document reported a 0 px touch target and a row count that had nothing to do
// with what is on screen. What these checks are about is what a thumb can
// reach, which is exactly the visible set.
const rows = await page.evaluate(() => {
  const shown = (e) => e.offsetParent !== null;
  const dials = [...document.querySelectorAll(".facing-dial")].filter(shown);
  const dial = [...document.querySelectorAll(".facing-dial button, .facing-dial input")]
    .filter(shown).map((e) => e.getBoundingClientRect());
  const acts = [...document.querySelectorAll(".facing-actions button")]
    .filter(shown).map((e) => e.getBoundingClientRect());
  const dialRows = new Set(dials.map((e) => Math.round(e.getBoundingClientRect().top)));
  return {
    dials: dialRows.size,
    dialCount: dials.length,
    allOnScreen: [...dial, ...acts].every((r) => r.bottom <= innerHeight + 1 && r.top >= 0),
    smallestTouch: Math.min(...[...dial, ...acts].map((r) => Math.min(r.width, r.height))),
    pickerShown: document.getElementById("facingDialPick")?.offsetParent !== null,
  };
});
// Counted, not hardcoded: the claim is that no dial shares a row with another
// (they are read left-to-right against the drawing, so a wrapped one is a
// misread), and that claim holds whether there are three of them or five. A
// literal 3 here failed the day a Head carriage dial was added — which is the
// review getting BETTER, and not something a smoke should call a regression.
check(rows.dials === rows.dialCount, "every visible dial gets a row of its own",
  `${rows.dials} row(s) for ${rows.dialCount} dial(s)`);
check(rows.allOnScreen, "every control is on screen");
check(rows.smallestTouch >= 28, "controls are thumb-sized",
  `smallest ${Math.round(rows.smallestTouch)}px`);

// ONE DIAL AT A TIME, on a phone, and the picker is how you reach the others.
// The narrow layout gives its rows to the canvas — which is the only thing on
// this screen anybody is looking at — so "one visible dial plus a picker" is
// the claim, and a picker that does not switch is the failure that would put
// three dials permanently out of reach.
if (rows.pickerShown) {
  check(rows.dialCount === 1, "the phone layout shows exactly one dial",
    `${rows.dialCount} visible`);
  const switched = await page.evaluate(async () => {
    const sel = document.getElementById("facingDialPick");
    const seen = [];
    for (const v of ["yaw", "scale", "stance", "arms", "shoulders", "head"]) {
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      const on = [...document.querySelectorAll("#facingDials .facing-dial")]
        .filter((e) => e.offsetParent !== null).map((e) => e.dataset.dial);
      seen.push(on.length === 1 && on[0] === v);
    }
    return seen.every(Boolean);
  });
  check(switched, "the picker switches which dial is shown");
} else {
  check(rows.dialCount === 6, "the desk shows every dial at once",
    `${rows.dialCount} visible`);
}

/** Same as useDial below, needed before it is defined. */
async function useDialEarly(name) {
  if (await page.evaluate(() => document.getElementById("facingDialPick")?.offsetParent !== null)) {
    await page.selectOption("#facingDialPick", name);
    await page.waitForTimeout(120);
  }
}

// THE ARM DIAL MOVES THE RIG. Same claim as the size, stance and turn dials
// below: a readout that changes while the model does not is the failure that
// looks most like success.
await useDialEarly("arms");
const armed = await page.evaluate(async () => {
  const L = await import("/render3d/src/loader.js");
  const THREE = await import("/vendor/three/three.module.js");
  const key = document.getElementById("charSelect").value;
  const reach = () => {
    const r = L.getRig(key);
    if (!r) return null;
    r.root.updateMatrixWorld(true);
    const h = r.root.getObjectByName("LeftHand");
    const s = r.root.getObjectByName("LeftArm");
    if (!h || !s) return null;
    const a = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
    const b = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
    return Math.hypot(a.x - b.x, a.z - b.z);
  };
  const before = reach();
  const el = document.getElementById("facingArm");
  el.value = "26";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  return { before, after: reach(), deg: L.getRig(key)?.armDeg };
});
if (armed.before === null) {
  check(true, "arm dial check skipped — this fighter has no arm bones");
} else {
  check(armed.deg === 26, "the arm dial reaches the rig", `armDeg ${armed.deg}`);
  check(armed.after > armed.before + 0.02,
    "...and the hand actually moves out from the shoulder",
    `${(armed.before * 100).toFixed(0)}cm -> ${(armed.after * 100).toFixed(0)}cm`);
}

// REVERT, per fighter. Every other control writes a number and there was no way
// back short of reloading the page, which throws away the whole session to undo
// one fighter's dial.
await useDialEarly("head");
const reverted = await page.evaluate(async () => {
  const val = () => document.getElementById("facingHeadVal").textContent;
  const was = val();
  const count = () => +(/· (\d+) changed/.exec(
    document.getElementById("facingProgress").textContent)?.[1] ?? -1);
  const changedBefore = count();
  const s = document.getElementById("facingHead");
  s.value = String(parseFloat(s.value) === -20 ? 20 : -20);
  s.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const moved = val() !== was;
  document.getElementById("facingRevert").click();
  await new Promise((r) => setTimeout(r, 250));
  // Compared, not asserted at zero: earlier checks in this file touch other
  // fighters, and "the counter is 0" would be a claim about them.
  return { moved, back: val() === was, clean: count() === changedBefore };
});
check(reverted.moved, "the head dial moves the number");
check(reverted.back, "Revert puts the fighter back to the manifest's number");
check(reverted.clean, "and drops them from the changed count");

// THE REFERENCE IS ON SCREEN. Sizing against a sprite that is not drawn is
// sizing from memory, and a blank half-frame looks exactly like a model that
// is already right. Both figures are sampled from the real canvas: the sprite
// stands COMPARE_DX left of the model, and both must have pixels standing on
// the floor line.
const halves = await page.evaluate(() => {
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const count = (x0, x1) => {
    const d = ctx.getImageData(x0, 0, x1 - x0, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 90) n++;
    return n;
  };
  const mid = Math.round(c.width * 0.5);
  return { left: count(0, mid), right: count(mid, c.width) };
});
check(halves.left > 400, "the idle sprite is drawn beside the model",
  `${halves.left} px in the sprite half`);
check(halves.right > 400, "...and the model is drawn too",
  `${halves.right} px in the model half`);

/** Bring a dial into reach before driving it.
 *
 *  On a phone only one dial is on screen and the rest are display:none, which
 *  playwright refuses to fill — correctly, because a user cannot touch them
 *  either. Picking first is what a user does, so it is what this does. On the
 *  desk the picker is hidden and every dial is already reachable. */
async function useDial(name) {
  if (await page.evaluate(() => document.getElementById("facingDialPick")?.offsetParent !== null)) {
    await page.selectOption("#facingDialPick", name);
    await page.waitForTimeout(120);
  }
}

// The dials move the RIG, not just their readouts.
const sized = await (async () => {
  const before = await page.evaluate(async () =>
    (await import("/render3d/src/loader.js")).getRig("gakuganji").renderScale);
  await useDial("scale");
  await page.fill("#facingScale", "1.22");
  await page.dispatchEvent("#facingScale", "input");
  await page.waitForTimeout(700);
  return {
    before,
    after: await page.evaluate(async () =>
      (await import("/render3d/src/loader.js")).getRig("gakuganji").renderScale),
    shown: await page.textContent("#facingScaleVal"),
  };
})();
check(Math.abs(sized.after - 1.22) < 0.001, "the size dial rescales the RIG",
  `${sized.before}× -> ${sized.after}× (shown ${sized.shown})`);

const stanced = await (async () => {
  await useDial("stance");
  await page.fill("#facingStance", "12");
  await page.dispatchEvent("#facingStance", "input");
  await page.waitForTimeout(700);
  return {
    rig: await page.evaluate(async () =>
      (await import("/render3d/src/loader.js")).getRig("gakuganji").stanceDeg),
    shown: await page.textContent("#facingStanceVal"),
  };
})();
check(stanced.rig === 12, "the stance dial widens the RIG's legs",
  `${stanced.rig}° (shown ${stanced.shown})`);

// The third dial. Facing was settled in its own pass, but it is judged against
// the same drawing as the size, so it belongs on the same screen.
const turned = await (async () => {
  await useDial("yaw");
  await page.fill("#facingYaw", "35");
  await page.dispatchEvent("#facingYaw", "input");
  await page.waitForTimeout(700);
  return {
    rig: await page.evaluate(async () =>
      (await import("/render3d/src/loader.js")).getRig("gakuganji").yawOffsetDeg),
    shown: await page.textContent("#facingYawVal"),
  };
})();
check(turned.rig === 35, "the turn dial rotates the RIG", `${turned.rig}° (shown ${turned.shown})`);
await useDial("yaw");
await page.fill("#facingYaw", "45");
await page.dispatchEvent("#facingYaw", "input");
await page.waitForTimeout(400);

// Stance has to reach the PIXELS, not just the rig object — it is a pose
// layer, and a layer that never gets applied changes a number and nothing
// else. Wide legs are wider: measure the model's silhouette at ankle height.
const widths = await page.evaluate(async (deg) => {
  const rigMod = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const c = document.querySelector("#facingStage canvas");
  const ctx = c.getContext("2d");
  const ankleBand = () => {
    // A band just above the floor line, model half only.
    const y0 = Math.round(c.height * 0.78), y1 = Math.round(c.height * 0.86);
    const x0 = Math.round(c.width * 0.5);
    const d = ctx.getImageData(x0, y0, c.width - x0, y1 - y0).data;
    const w = c.width - x0;
    let lo = 1e9, hi = -1;
    for (let y = 0; y < y1 - y0; y++) {
      for (let x = 0; x < w; x++) {
        if (d[((y * w) + x) * 4 + 3] > 90) { if (x < lo) lo = x; if (x > hi) hi = x; }
      }
    }
    return hi < 0 ? 0 : hi - lo;
  };
  const settle = () => new Promise((r) => setTimeout(r, 700));
  rigMod.setRigSettings("gakuganji", { stanceDeg: 0 });
  scene.clearCache();
  await settle();
  const narrow = ankleBand();
  rigMod.setRigSettings("gakuganji", { stanceDeg: deg });
  scene.clearCache();
  await settle();
  return { narrow, wide: ankleBand() };
}, 22);
check(widths.wide > widths.narrow + 4,
  "...and that reaches the pixels, not just the number",
  `ankles ${widths.narrow}px at 0° -> ${widths.wide}px at 22°`);

// WIDTH, not a stride. The first stance layer turned the thighs about the
// direction the manifest THOUGHT the fighter faced, which is off by the yaw
// offset — a right angle for the worst of them, so the dial walked their legs
// forward and back instead of apart, and rolled the soles off the floor while
// it was at it. Measured on the skeleton, in the pelvis's own frame, because
// pixels alone cannot tell a widening from a stride under a ¾ camera.
const splay = await page.evaluate(async (deg) => {
  const rigMod = await import("/render3d/src/loader.js");
  const pose = await import("/render3d/src/pose.js");
  const r = rigMod.getRig("gakuganji");
  const clip = rigMod.resolveClip("gakuganji", "idle")?.clip;
  if (!r || !clip) return null;
  const read = (stanceDeg) => {
    pose.poseRig(r, "idle", 0, clip, { charKey: "gakuganji", stanceDeg });
    r.root.updateMatrixWorld(true);
    const at = (n) => { const e = r.root.getObjectByName(n).matrixWorld.elements; return [e[12], e[13], e[14]]; };
    const soleUp = () => { const e = r.root.getObjectByName("LeftFoot").matrixWorld.elements;
      const l = Math.hypot(e[4], e[5], e[6]) || 1; return [e[4] / l, e[5] / l, e[6] / l]; };
    const lh = at("LeftUpLeg"), rh = at("RightUpLeg");
    const n = Math.hypot(rh[0] - lh[0], rh[2] - lh[2]) || 1;
    const lat = [(rh[0] - lh[0]) / n, (rh[2] - lh[2]) / n];
    const lf = at("LeftFoot"), rf = at("RightFoot");
    const d = [rf[0] - lf[0], rf[2] - lf[2]];
    return {
      width: d[0] * lat[0] + d[1] * lat[1],
      stride: d[0] * -lat[1] + d[1] * lat[0],
      floor: Math.min(lf[1], rf[1]),
      up: soleUp(),
    };
  };
  const a = read(0), b = read(deg);
  const dot = Math.max(-1, Math.min(1, a.up.reduce((s, c, i) => s + c * b.up[i], 0)));
  rigMod.setRigSettings("gakuganji", { stanceDeg: 0 });
  return {
    width: (b.width - a.width) * 100,
    stride: (b.stride - a.stride) * 100,
    roll: (Math.acos(dot) * 180) / Math.PI,
    lift: (b.floor - a.floor) * 100,
  };
}, 22);
check(splay && splay.width > 8 && Math.abs(splay.stride) < 1,
  "...as WIDTH across the pelvis, not a stride along it",
  splay ? `+${splay.width.toFixed(1)}cm apart, ${splay.stride.toFixed(1)}cm fore/aft` : "no rig");
check(splay && Math.abs(splay.lift) < 0.5,
  "...without lifting the fighter off the floor",
  splay ? `floor moved ${splay.lift.toFixed(1)}cm` : "no rig");

// THE STAND ITSELF, on the skeleton. Straight legs, level soles, both ankles
// on one floor — the last of those needs the legs to be the same LENGTH, and
// twenty of the twenty-seven deliveries arrived asymmetric (Geto by 12 cm).
const stand = await page.evaluate(async () => {
  const rigMod = await import("/render3d/src/loader.js");
  const pose = await import("/render3d/src/pose.js");
  const r = rigMod.getRig("gakuganji");
  const clip = rigMod.resolveClip("gakuganji", "idle")?.clip;
  if (!r || !clip) return null;
  const at = (n) => { const b = r.root.getObjectByName(n); if (!b) return null;
    const e = b.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const read = (stanceDeg) => {
  pose.poseRig(r, "idle", 0, clip, { charKey: "gakuganji", stanceDeg });
  r.root.updateMatrixWorld(true);
  let bend = 0, tilt = 0;
  const ankles = [];
  for (const side of ["Left", "Right"]) {
    const hip = at(`${side}UpLeg`), knee = at(`${side}Leg`), ankle = at(`${side}Foot`);
    const a = norm(sub(knee, hip)), b = norm(sub(ankle, knee));
    bend = Math.max(bend, (Math.acos(Math.max(-1, Math.min(1,
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI);
    const foot = r.root.getObjectByName(`${side}Foot`);
    const toe = foot?.children.find((c) => c.isBone);
    if (toe) {
      const d = norm(sub(at(toe.name), ankle));
      tilt = Math.max(tilt, Math.abs((Math.asin(d[1]) * 180) / Math.PI));
    }
    ankles.push(ankle[1]);
  }
  return { bend, tilt, dY: Math.abs(ankles[0] - ankles[1]) * 100 };
  };
  return { closed: read(0), wide: read(22) };
});
check(stand && stand.closed.bend < 1 && stand.wide.bend < 1, "the idle stands on STRAIGHT legs",
  stand ? `knee ${stand.closed.bend.toFixed(1)}° off straight closed, ${stand.wide.bend.toFixed(1)}° wide` : "no rig");
check(stand && stand.closed.tilt < 1 && stand.closed.dY < 0.3
    && stand.wide.tilt < 1 && stand.wide.dY < 0.3,
  "...with both soles flat on one floor, at any stance",
  stand ? `closed: ${stand.closed.tilt.toFixed(1)}° off level, ${stand.closed.dY.toFixed(2)}cm apart`
        + `  ·  wide: ${stand.wide.tilt.toFixed(1)}° off level, ${stand.wide.dY.toFixed(2)}cm apart` : "no rig");

// The download is the thing the whole mode exists to produce, and it has to
// be a payload `billboard_intake.mjs apply` will take without editing.
const dl = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
await page.click("#facingSave");
const download = await dl;
check(!!download, "Download JSON produces a file",
  download ? download.suggestedFilename() : "no download event");
if (download) {
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* reported below */ }
  check(payload?.kind === "render3d-workbench",
    "...in the shape `apply --backend 3d` expects", `kind ${payload?.kind}`);
  const entry = payload?.characters?.gakuganji;
  check(!!entry && Number.isFinite(entry.renderScale) && Number.isFinite(entry.stanceDeg)
      && Number.isFinite(entry.yawOffsetDeg),
    "...carrying all three adjustments on a full manifest entry",
    entry ? `gakuganji ${entry.renderScale}× / ${entry.stanceDeg}° / ${entry.yawOffsetDeg}°` : "gakuganji missing");
  check(!!entry?.model && entry?.approved === true,
    "...without dropping the rest of that character's entry");
}

// Closing puts the viewer back where it came from — a workbench left without
// its canvas is a dead page.
await page.click("#facingClose");
await page.waitForTimeout(900);
const closed = await page.evaluate(() => ({
  hidden: document.getElementById("facingOverlay").hidden,
  back: !!document.querySelector(".stage-col canvas#stage"),
}));
check(closed.hidden && closed.back, "closing restores the viewer to the desk");
check(glbCount < 27, "the whole roster never got pulled in",
  `${glbCount} model(s), ${(glbBytes / 1e6).toFixed(1)} MB`);
check(errors.length === 0, "no page errors throughout", errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
