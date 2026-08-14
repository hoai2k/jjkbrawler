// Smoke the 3D workbench's POSE bench — the default one, where a fighter is
// matched to their own drawings one at a time.
//
// What it is guarding is the claim the bench makes: that the thing on the left
// is the drawing named in the dropdown, that the model beside it is posed at
// the instant that drawing is on screen, and that an edit lands on THAT pose
// rather than somewhere in the middle of a clip. None of those throw when they
// break — you just spend a session posing against the wrong reference.
//
//     node server.mjs &
//     node tools/smoke_pose_bench.mjs [baseUrl] [--chromium]
import { chromium, webkit } from "playwright";

const BASE = process.argv.slice(2).find((a) => !a.startsWith("--"))
  || "http://127.0.0.1:5174";
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

const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/render3d/workbench/index.html?char=maki`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 });
await page.waitForTimeout(1500);

// ------------------------------------------------------------- the pose bench

check(await page.evaluate(() => document.body.classList.contains("mode-pose")),
  "the bare URL opens the POSE bench");
const hiddenAnim = await page.evaluate(() =>
  ["scrub", "playBtn", "keyStrip", "easeSelect", "twosToggle"]
    .filter((id) => document.getElementById(id)?.offsetParent !== null));
check(hiddenAnim.length === 0,
  "the animation controls are not in the way", hiddenAnim.length ? `still shown: ${hiddenAnim}` : "playhead, keys, ease, twos");

const poses = await page.evaluate(() => {
  const sel = document.getElementById("poseSelect");
  return { n: sel.options.length, groups: [...sel.querySelectorAll("optgroup")].map((g) => g.label),
           first: sel.value };
});
check(poses.n > 20, "every sprite pose this fighter draws is listed", `${poses.n} poses`);
check(poses.groups.length > 8 && poses.groups[0] === "idle",
  "grouped by the state that draws them", `${poses.groups.length} groups, first "${poses.groups[0]}"`);

// The reference has to be the pose NAMED, not whatever the playhead happens to
// be over — the failure that would quietly waste a whole session.
const shown = await page.evaluate(async () => {
  const sel = document.getElementById("poseSelect");
  sel.value = "attack_heavy_b";
  sel.onchange();
  await new Promise((r) => setTimeout(r, 600));
  return { where: document.getElementById("poseWhere").textContent,
           url: new URL(location).searchParams.get("pose"),
           state: document.getElementById("stateSelect").value };
});
check(shown.url === "attack_heavy_b" && shown.state === "sideHeavy",
  "picking a pose selects the state that draws it", `${shown.state} · ?pose=${shown.url}`);
check(/frame 2 of 2/.test(shown.where) && /fps/.test(shown.where),
  "...and says where it sits in that state's cycle", shown.where);

// Both figures actually on screen, in their own halves.
const halves = await page.evaluate(() => {
  const c = document.getElementById("stage");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let left = 0, right = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[((y * c.width) + x) * 4 + 3] > 40) (x < c.width / 2 ? left++ : right++);
    }
  }
  return { left, right };
});
check(halves.left > 3000 && halves.right > 3000,
  "the drawing stands beside the model, both drawn",
  `sprite half ${halves.left}px, model half ${halves.right}px`);

// The editor's keys are the drawings — this is the whole strategy in one
// assertion. Key names, not times.
const keys = await page.evaluate(() => {
  const t = window.__poseEditor.tables.maki?.sideHeavy;
  return t ? { frames: t.keys.map((k) => k.frame), times: t.keys.map((k) => +k.t.toFixed(3)),
               fromPoses: t.fromPoses } : null;
});
check(keys?.fromPoses && keys.frames.join(",") === "attack_heavy_a,attack_heavy_b",
  "the animation's keys ARE the sprite poses", keys ? keys.frames.join(", ") : "no table");
check(keys && Math.abs(keys.times[1] - 1 / 6) < 0.01,
  "...timed at the sprite animation's own frame rate", keys ? `${keys.times.join("s, ")}s at 6 fps` : "");

// An edit has to land on the selected pose, and be reported as landing there.
const edited = await page.evaluate(async () => {
  const ed = window.__poseEditor;
  // Spine, not an arm: in a strike the arm belongs to the reach solver, so an
  // edit on it is deliberately saved as a post-solve offset instead of a pose.
  const before = JSON.stringify(ed.tables.maki.sideHeavy.keys[1].pose.Spine);
  ed.state.joint = "Spine";
  document.getElementById("jointSelect").value = "Spine";
  document.getElementById("jointSelect").onchange();
  const row = document.querySelectorAll("#axisRows .axis input[type=number]")[0];
  row.value = "30";
  row.onchange();
  await new Promise((r) => setTimeout(r, 400));
  const k = ed.tables.maki.sideHeavy.keys;
  return { before, after: JSON.stringify(k[1].pose.Spine),
           onKey0: [...(k[0].editedBones || [])], onKey1: [...(k[1].editedBones || [])],
           marked: document.getElementById("poseSelect").selectedOptions[0].textContent };
});
check(edited.after !== edited.before && edited.onKey1.includes("Spine"),
  "an edit lands on the pose being looked at", `attack_heavy_b Spine ${edited.before} -> ${edited.after}`);
check(edited.onKey0.length === 0,
  "...and not on the pose next door", `attack_heavy_a untouched`);
check(edited.marked.startsWith("●"),
  "...and the list says which poses are done", edited.marked.trim());

// ------------------------------------------------------- the animation bench

await page.goto(`${BASE}/render3d/workbench/index.html?edit=keys&char=maki&state=sideHeavy`,
  { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 });
await page.waitForTimeout(1200);
check(await page.evaluate(() => document.body.classList.contains("mode-anim")),
  "?edit=keys opens the animation bench");
const shownAnim = await page.evaluate(() =>
  ["scrub", "playBtn", "keyStrip", "easeSelect", "interpToggle"]
    .filter((id) => document.getElementById(id)?.offsetParent !== null));
check(shownAnim.length === 5, "the playhead and the curves live there", shownAnim.join(", "));
check(await page.evaluate(() => document.getElementById("poseSelect").offsetParent === null),
  "...and the pose picker steps aside");
const strip = await page.evaluate(() =>
  [...document.querySelectorAll("#keyStrip .keychip")].map((b) => b.textContent));
check(strip.join(",") === "attack_heavy_a,attack_heavy_b",
  "the keyframe strip names the drawings", strip.join(" / "));

// The A/B the strategy needs: same state, two different animations.
//
// ASKED OF THE CLIPS, not of the pixels. This used to compare opaque-pixel
// counts between the toggle's two settings, and it could not fail: the edit
// check above dirties maki's sideHeavy table and the edit survives the
// reload, so both halves played the same rebuilt clip, and two frames of one
// animation differ by a pixel or two, which the count read as "different".
//
// Nor can pixels answer it in general. Every state of maki's except the idle
// already resolves to a LIBRARY clip, which is itself built from the sprite
// poses — for those, "delivered" and "interpolated" are two roads to the same
// animation and SHOULD look alike. The question the toggle actually asks is
// which clip is playing, so that is what is checked.
const ab = await page.evaluate(async () => {
  const ed = window.__poseEditor;
  const rigs = await import("/render3d/src/loader.js");
  const box = document.getElementById("interpToggle");
  // A state with no edits on it, so "a clip comes back" means the
  // interpolation put it there rather than the editor having done.
  const st = "light";
  const settle = () => new Promise((r) => setTimeout(r, 400));
  box.checked = false; box.onchange(); await settle();
  const off = ed.editedClip("maki", st);
  box.checked = true; box.onchange(); await settle();
  const on = ed.editedClip("maki", st);
  const table = ed.tables.maki?.[st];
  // Put the toggle back — everything downstream draws the stage and compares
  // it, and an audition left running is a difference they would all inherit.
  box.checked = false; box.onchange(); await settle();
  return {
    off: off ? off.name : null,
    on: on ? { name: on.name, tracks: on.tracks.length, dur: +on.duration.toFixed(3) } : null,
    dirty: !!table?.dirty,
    fromPoses: !!table?.fromPoses,
    keys: table?.keys?.map((k) => k.frame) || [],
    resolved: rigs.resolveClip("maki", st)?.source,
  };
});
check(!ab.dirty && ab.fromPoses && ab.keys.length > 1,
  "the A/B runs on an unedited state whose keys are sprite poses",
  `maki light: ${ab.keys.join(", ")} (${ab.resolved} clip), dirty=${ab.dirty}`);
check(ab.off === null,
  "with the toggle off the fighter plays the clip they were given",
  ab.off === null ? "no editor clip" : `editor clip "${ab.off}"`);
check(!!ab.on && ab.on.tracks > 10 && ab.on.dur > 0,
  "...and with it on, one built from the sprite poses instead",
  ab.on ? `"${ab.on.name}", ${ab.on.tracks} tracks, ${ab.on.dur}s` : "no clip built");

// ------------------------------------------------------------- the bone proxy

const rigView = await page.evaluate(async () => {
  const scene = await import("/render3d/src/scene.js");
  const rigMod = await import("/render3d/src/loader.js");
  const settle = () => new Promise((r) => setTimeout(r, 800));
  const skinShown = () => {
    let skin = 0, boxes = 0;
    rigMod.getRig("maki").root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.isBoneProxy) { if (o.visible) boxes++; }
      else if (o.visible) skin++;
    });
    return { skin, boxes };
  };
  // THE SKELETON IS NOT A MODE THE RIG SITS IN. It is a second render of the
  // same body: the proxy goes on for the length of one renderPose and comes
  // straight back off, so between draws the rig is meant to be showing skin.
  // Asking "is it showing bones now?" after the toggle settles therefore tests
  // an architecture the workbench no longer has — it read 0 boxes for exactly
  // the reason the design says it should. What survives the change is the
  // claim a viewer actually makes: the swap works when applied, and turning
  // the checkbox on draws a DIFFERENT PICTURE.
  const before = skinShown();
  const applied = (() => {
    rigMod.setBoneProxy("maki", true);
    const on = skinShown();
    rigMod.setBoneProxy("maki", false);
    return { on, back: skinShown() };
  })();

  // A coarse coverage grid — "is this a different picture?" — not a pixel
  // count: a skeleton and a body can cover similar areas and still look
  // nothing alike.
  const ink = () => {
    const c = document.getElementById("stage");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const G = 24, g = new Array(G * G).fill(0);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[((y * c.width) + x) * 4 + 3] > 40) {
          g[Math.min(G - 1, Math.floor((y / c.height) * G)) * G
            + Math.min(G - 1, Math.floor((x / c.width) * G))]++;
        }
      }
    }
    return g;
  };
  const pick = async (v) => {
    const sel = document.getElementById("compareWith");
    sel.value = v;
    sel.onchange();
    await settle();
  };
  const drawnSkin = ink();
  await pick("mannequin");
  const drawnBones = ink();
  await pick("sprite");
  const drawnAgain = ink();
  const diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  return {
    before, applied,
    changed: diff(drawnSkin, drawnBones),
    restored: diff(drawnSkin, drawnAgain),
    // The fighter's own footprint, not the whole grid: most of the stage is
    // background and floor, which a skeleton does not touch and which would
    // drown the signal in a denominator it has nothing to do with.
    inked: drawnSkin.filter((v) => v > 0).length,
  };
});
check(rigView.before.boxes === 0 && rigView.before.skin > 0,
  "the model is the model until asked otherwise", `${rigView.before.skin} skin mesh(es)`);
check(rigView.applied.on.skin === 0 && rigView.applied.on.boxes > 20,
  "Mannequin(s) draws the fighter's own bones instead of their skin",
  `${rigView.applied.on.boxes} bone boxes, ${rigView.applied.on.skin} skin`);
check(rigView.applied.back.skin === rigView.before.skin && rigView.applied.back.boxes === 0,
  "...and turning it off gives the model back exactly",
  `${rigView.applied.back.skin} skin mesh(es)`);
check(rigView.changed > rigView.inked * 0.25,
  "the checkbox actually redraws the stage as a skeleton",
  `${rigView.changed} of ${rigView.inked} inked cells differ`);
check(rigView.restored === 0,
  "...and unchecking it draws the model back, to the cell",
  `${rigView.restored} cell(s) still differ`);

// --------------------------------------------------- the shoulder-width dial
//
// IT MUST PUSH THE SHOULDERS APART, not turn them. The dial moves each arm
// root out along the body's own shoulder line, and the arm layer reads BIND
// frames — which are the model's, and know nothing about the yaw poseRig puts
// on the root for a delivery that was built facing somewhere other than the
// camera. Treating those frames as world silently rotated the push by exactly
// that offset, so at Nanami's 75 degrees almost all of a 10 cm widening went
// fore-and-aft instead: one shoulder forward, one back, which is a twist.
// Maki is yawed 60, so a rig with no offset cannot stand in for her here.

const wide = await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const THREE = await import("/vendor/three/three.module.js");
  const r = rigs.getRig("maki");
  if (!r || r.isMannequin) return null;
  const at = (n) => {
    const o = r.root.getObjectByName(n);
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    return v;
  };
  const res = rigs.resolveClip("maki", "idle");
  const keep = r.shoulderOutCm;
  const pose = () => { scene.posePreview("maki", "idle", 0, r, res, {}); r.root.updateMatrixWorld(true); };
  r.shoulderOutCm = 0; pose();
  const L0 = at("LeftArm"), R0 = at("RightArm");
  // The body's own axes, taken before anything moves.
  const lat = R0.clone().sub(L0); lat.y = 0; lat.normalize();
  const fwd = new THREE.Vector3(-lat.z, 0, lat.x);
  r.shoulderOutCm = 10; pose();
  const dL = at("LeftArm").sub(L0), dR = at("RightArm").sub(R0);
  r.shoulderOutCm = keep; pose();
  return {
    yaw: r.yawOffsetDeg,
    outCm: [-dL.dot(lat) * 100, dR.dot(lat) * 100].map((v) => +v.toFixed(2)),
    fwdCm: [dL.dot(fwd) * 100, dR.dot(fwd) * 100].map((v) => +v.toFixed(2)),
  };
});
if (!wide) {
  check(false, "maki's rig is loaded for the shoulder check");
} else {
  check(Math.abs(wide.yaw) > 15,
    "the shoulder check runs on a YAWED rig, or it proves nothing", `yaw ${wide.yaw}°`);
  check(wide.outCm.every((v) => v > 9.5),
    "a 10 cm shoulder dial moves both arm roots 10 cm outward",
    `${wide.outCm.join(" / ")} cm out`);
  check(wide.fwdCm.every((v) => Math.abs(v) < 1),
    "...and does not push either of them fore or aft",
    `${wide.fwdCm.join(" / ")} cm fore/aft`);
}

// ------------------------------------------- the GLB corrections hold in ALL
//                                             states, not just the idle
//
// The shoulder dial used to be an argument to the idle-arm layer, which meant
// it only existed while a fighter was standing still: Uro measured 37.6 cm
// across the shoulders in her idle and 24.9 cm mid-punch — a 12.7 cm snap,
// exactly twice her 6.5 cm correction, on the first frame of every attack.
//
// That is the failure mode this class of number invites, so it is guarded
// rather than commented: a correction to the MODEL is true of the body no
// matter what it is doing, and the test is that turning the dial moves the
// shoulders by the same amount in a strike as it does at rest.

const across = await page.evaluate(async () => {
  const rigs = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const THREE = await import("/vendor/three/three.module.js");
  const r = rigs.getRig("maki");
  if (!r || r.isMannequin) return null;
  const at = (n) => r.root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  const keep = r.shoulderOutCm;
  // Span between the arm roots, with the dial off and then at 10 cm. The
  // DIFFERENCE is what has to match across states — the raw span does not,
  // because a punch legitimately swings one shoulder round.
  const spanFor = (state) => {
    const res = rigs.resolveClip("maki", state);
    const measure = () => {
      scene.posePreview("maki", state, 0, r, res, {});
      r.root.updateMatrixWorld(true);
      return at("LeftArm").distanceTo(at("RightArm"));
    };
    r.shoulderOutCm = 0; const off = measure();
    r.shoulderOutCm = 10; const on = measure();
    return +((on - off) * 100).toFixed(2);
  };
  const out = {};
  for (const s of ["idle", "light", "sideHeavy", "crouch", "run"]) out[s] = spanFor(s);
  r.shoulderOutCm = keep;
  scene.posePreview("maki", "idle", 0, r, rigs.resolveClip("maki", "idle"), {});
  return out;
});
if (!across) {
  check(false, "maki's rig is loaded for the cross-state correction check");
} else {
  const vals = Object.values(across);
  const spread = Math.max(...vals) - Math.min(...vals);
  const shown = Object.entries(across).map(([k, v]) => `${k} ${v}`).join(" / ");
  check(vals.every((v) => v > 15),
    "the shoulder correction reaches every state, not only the idle", shown);
  check(spread < 1.5,
    "...and widens the shoulders by the same amount in each",
    `spread ${spread.toFixed(2)} cm`);
}

// ------------------------------------------------------------- the alternate
//
// TWO MODELS OF ONE FIGHTER, judged against each other rather than from
// memory. The claim that matters is not that a second body appears — it is
// that the second body is dressed in ITS OWN numbers: an older generation was
// reviewed at its own size and turn, and showing it at the current model's
// would answer the question being asked before it is asked.

const alt = await page.evaluate(async () => {
  const rigMod = await import("/render3d/src/loader.js");
  const settle = () => new Promise((r) => setTimeout(r, 900));
  const sel = document.getElementById("compareWith");
  const pick = async (v) => { sel.value = v; sel.onchange(); await settle(); };
  const dial = () => document.getElementById("scaleVal").textContent;

  // MOMO, not the fighter this page opened on. Maki's two generations happen
  // to share a renderScale (1.15 both), so a test run on her passes whether
  // the alternate wears its own numbers or the current model's — it cannot
  // fail, which makes it worthless for the one thing it is here to check.
  // Momo's differ (1.16 against 1.12). Walking there also exercises the
  // character switch while Alt GLB is the selected comparison.
  const chars = document.getElementById("charSelect");
  chars.value = "momo";
  chars.onchange();
  await settle();
  await settle();

  await pick("sprite");
  const current = { dial: dial(), scale: rigMod.getRig("momo")?.renderScale };
  await pick("alt");
  await settle();
  const shown = rigMod.getRig(rigMod.altKey("momo"));
  const out = {
    has: rigMod.hasAlt("momo"),
    entry: rigMod.altEntry("momo"),
    loaded: !!shown,
    altScale: shown?.renderScale, altHeight: shown?.declaredHeight,
    altYaw: shown?.yawOffsetDeg, altStance: shown?.stanceDeg,
    dialNow: dial(),
    current,
    labelled: (() => {
      // The two columns are named on the canvas, or you cannot tell which is
      // which — which is the entire job of this view.
      const c = document.getElementById("stage");
      return c.width > 0;
    })(),
  };
  await pick("sprite");
  out.dialBack = dial();
  chars.value = "maki";
  chars.onchange();
  await settle();
  return out;
});

check(alt.has && !!alt.entry?.model, "momo has a second model on file", alt.entry?.model);
check(alt.loaded, "picking Alt GLB loads it as its own rig", "momo#alt");
check(alt.altScale === alt.entry.renderScale && alt.altHeight === alt.entry.heightM
  && alt.altScale !== alt.current.scale,
  "...wearing its OWN size, not the current model's",
  `alt ${alt.altScale}x at ${alt.altHeight}m vs current ${alt.current.scale}x`);
check(alt.altYaw === (alt.entry.yawOffsetDeg ?? 0) && alt.altStance === (alt.entry.stanceDeg ?? 0),
  "...and its own turn and stance", `yaw ${alt.altYaw}°, stance ${alt.altStance}°`);
check(alt.dialNow === `${alt.altScale.toFixed(2)}×`,
  "the size dial points at the model being shown", `${alt.current.dial} -> ${alt.dialNow}`);
check(alt.dialBack === alt.current.dial,
  "...and points back at the current model when the drawing returns", alt.dialBack);

// --------------------------------------------------------------- free look

const look = await page.evaluate(async () => {
  const scene = await import("/render3d/src/scene.js");
  // A SIGNATURE of the model half, not a count of it. Turning a figure barely
  // changes how many pixels it covers — the ground line alone is wider than
  // the difference — so what is compared is a coarse coverage grid, which says
  // "this is a different picture" whatever the areas happen to be.
  const ink = () => {
    const c = document.getElementById("stage");
    const x0 = Math.round(c.width * 0.5);
    const d = c.getContext("2d").getImageData(x0, 0, c.width - x0, c.height).data;
    const w = c.width - x0, G = 24;
    const g = new Array(G * G).fill(0);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < w; x++) {
        if (d[((y * w) + x) * 4 + 3] > 40) {
          g[Math.min(G - 1, Math.floor((y / c.height) * G)) * G
            + Math.min(G - 1, Math.floor((x / w) * G))]++;
        }
      }
    }
    return g;
  };
  const settle = () => new Promise((r) => setTimeout(r, 700));
  await settle();
  const before = { key: scene.orbitKey(), ink: ink() };
  document.getElementById("view3d").click();
  await settle();
  return { before, on: document.getElementById("view3d").checked,
           locked: (await import("/billboards/workbench/viewport.js"), window.__viewport?.locked) };
});
check(look.on && look.locked === true,
  "View 3D takes the viewer over from the 2D pan and zoom");

// A real drag, through the real pointer path.
const box = await page.locator("#stage").boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(box.x + box.width * 0.6 - i * 18, box.y + box.height * 0.5 - i * 4);
  await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(900);
const turned = await page.evaluate(async (before) => {
  const scene = await import("/render3d/src/scene.js");
  const c = document.getElementById("stage");
  const x0 = Math.round(c.width * 0.5);
  const d = c.getContext("2d").getImageData(x0, 0, c.width - x0, c.height).data;
  const w = c.width - x0, G = 24;
  const g = new Array(G * G).fill(0);
  let total = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < w; x++) {
      if (d[((y * w) + x) * 4 + 3] > 40) {
        g[Math.min(G - 1, Math.floor((y / c.height) * G)) * G
          + Math.min(G - 1, Math.floor((x / w) * G))]++;
        total++;
      }
    }
  }
  let moved = 0;
  for (let i = 0; i < g.length; i++) moved += Math.abs(g[i] - before[i]);
  return { key: scene.orbitKey(), moved, total,
           edits: !!document.querySelector("#poseBox.editing") };
}, look.before.ink);
check(turned.key && turned.key !== look.before.key,
  "dragging turns the model", `orbit ${turned.key}`);
check(turned.moved > turned.total * 0.15,
  "...and the pixels turn with it",
  `${turned.moved} of ${turned.total} px moved in the silhouette`);
check(!turned.edits, "...without the drag landing on the pose");

const off = await page.evaluate(async () => {
  const scene = await import("/render3d/src/scene.js");
  document.getElementById("view3d").click();
  await new Promise((r) => setTimeout(r, 700));
  return { key: scene.orbitKey(), locked: window.__viewport?.locked };
});
check(off.key === "" && off.locked === false,
  "turning it off puts the game's own camera back", `orbit "${off.key}"`);

// ------------------------------------------------------------- the line-up

await page.goto(`${BASE}/render3d/workbench/index.html?char=gojo`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 90000 });
let glb = 0;
page.on("response", (r) => { if (r.url().endsWith(".glb")) glb++; });
await page.click("#fiveToggle");
await page.waitForTimeout(14000);

check(await page.evaluate(() => document.body.classList.contains("five")),
  "Show 5 across opens the line-up");
check(await page.evaluate(() => document.getElementById("view3d").disabled
    && document.getElementById("view3dBox").classList.contains("disabled")),
  "...and free look greys out rather than turning one of the five");
check(glb >= 4, "...and brings the other four models in", `${glb} model(s) fetched on demand`);
// Computed display, not offsetParent: the panel sections are `display:
// contents`, which has no box of its own and so reads as "not visible"
// whether or not it is actually hidden.
const put = await page.evaluate(() => ({
  perFighter: [...document.querySelectorAll(".one-char")]
    .filter((e) => getComputedStyle(e).display !== "none").length,
  globals: ["stageSelect", "par", "ikToggle", "compareMode", "poseSelect"]
    .filter((id) => document.getElementById(id)?.offsetParent !== null).length,
}));
check(put.perFighter === 0, "every per-fighter dial is put away", "pose editor, size, facing, look-dev, clips");
check(put.globals === 5, "...and the ones that mean the same thing for all five stay",
  "stage light, parallax, foot IK, comparison, pose");

// Five columns of ink, and a reference over each — the arrangement itself.
const row = await page.evaluate(() => {
  const c = document.getElementById("stage");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const col = new Array(c.width).fill(0);
  let overhead = 0, ground = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[((y * c.width) + x) * 4 + 3] > 40) {
        col[x]++;
        if (y < c.height * 0.5) overhead++; else ground++;
      }
    }
  }
  // Count runs of inked columns separated by clear gaps: one run per fighter.
  let runs = 0, gap = 0;
  for (const n of col) {
    if (n > 2) { if (gap > 18) runs++; gap = 0; } else gap++;
  }
  return { runs: runs + 1, overhead, ground };
});
check(row.runs >= 5, "five fighters stand along the floor", `${row.runs} columns of ink`);
check(row.overhead > 4000 && row.ground > 4000,
  "each drawing hangs above its own model", `${row.overhead}px overhead, ${row.ground}px on the floor`);

await page.click("#fiveToggle");
await page.waitForTimeout(1200);
check(await page.evaluate(() => !document.body.classList.contains("five")
    && [...document.querySelectorAll(".one-char")]
      .every((e) => getComputedStyle(e).display !== "none")),
  "turning it off gives the dials back");

check(errors.length === 0, "no page errors throughout", errors.slice(0, 3).join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
