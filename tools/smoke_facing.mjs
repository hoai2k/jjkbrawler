// Smoke-test which way the fighter faces, on both model backends.
//
// WHY THIS IS A SMOKE AND NOT A LOOK. The camera yaw was wrong twice, and both
// times a human looked at the render and did not see it — because a 384-pixel
// figure in a dark hoodie looks broadly the same from four different angles,
// and because the workbench and the game agreed with each other, so the
// comparison that would have caught it did not exist. It took a fighter
// striding into the screen for a whole review round for anyone to notice.
//
// Two conditions have to hold at once, and they are cheap to state exactly:
//
//   forward · cameraRight  > 0   the fighter faces SCREEN-RIGHT
//   forward · (-cameraFwd) > 0   and his FRONT is toward the lens
//
// Facing is measured from the rig itself — the vector from heel to toe — not
// from the root transform, so a rig delivered backwards (round B1's was) fails
// here rather than passing on a nominally-correct node rotation.
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_facing.mjs [baseUrl]

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const CHAR = process.argv[3] || "yuji";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`  page error: ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/index.html?render=3d&mannequin=none&camera=flat`);
  await page.waitForFunction(
    async () => (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 60000 });

  const measured = await page.evaluate(async (char) => {
    const THREE = await import("/vendor/three/three.module.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    const out = {};

    // BOTH backends reset the root's yaw the moment they have drawn (see the
    // line after `scene.remove(rig.root)` in each renderer): the turn belongs
    // to the draw, not to the rig at rest. So a measurement taken after
    // renderPose returns reads the model UN-turned — which is why this smoke
    // reported the two backends identical for months while one of them applied
    // a per-character facing correction and the other did not. Put the turn
    // back before measuring, exactly as the draw does.
    const asDrawn = (rig) => {
      rig.root.rotation.y = rig.yawOffset || 0;
      rig.root.updateMatrixWorld(true);
      return rig;
    };

    const measure = (rig, cam) => {
      // Heel to toe, flattened: the body's own forward, independent of how the
      // node it hangs under happens to be rotated.
      const heel = rig.root.getObjectByName("LeftFoot");
      const toe = rig.root.getObjectByName("LeftToeBase") || heel;
      if (!heel || heel === toe) return null;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      heel.getWorldPosition(a); toe.getWorldPosition(b);
      const fwd = b.sub(a); fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) return null;
      fwd.normalize();
      const camFwd = new THREE.Vector3(); cam.getWorldDirection(camFwd);
      camFwd.y = 0; camFwd.normalize();
      const camRight = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
      camRight.y = 0; camRight.normalize();
      return {
        screenRight: +fwd.dot(camRight).toFixed(3),
        towardLens: +(-fwd.dot(camFwd)).toFixed(3),
      };
    };

    {
      const rigs = await import("/render3d/src/loader.js");
      const scene = await import("/render3d/src/scene.js");
      const rig = rigs.getRig(char);
      if (rig) {
        scene.renderPose(char, "idle", 0.1, rig, rigs.resolveClip(char, "idle"), { turnYawRad: 0 });
        out["render3d"] = measure(asDrawn(rig), scene.__cam());
      }
    }
    {
      const rigMod = await import("/render3d/src/loader.js");
      const renderer = await import("/billboards/src/renderer.js");
      const { CHARACTER_KEYS } = await import("/src/characters.js");
      renderer.initRenderer(THREE);
      await rigMod.initRigs(THREE, GLTFLoader, [], CHARACTER_KEYS);
      const rig = rigMod.getRig(char);
      if (rig) {
        renderer.renderPose(char, "idle", 0.1, rigMod.resolveClip);
        out["billboard"] = measure(asDrawn(rig), renderer.__cam());
      }
    }
    return out;
  }, CHAR);

  const backends = Object.keys(measured);
  check(backends.length === 2, `${CHAR} has a rig on both model backends`,
    backends.length ? `got: ${backends.join(", ")}` : "no rigs registered");
  for (const [backend, m] of Object.entries(measured)) {
    if (!m) { check(false, `${backend}: facing measurable`, "no toe bone"); continue; }
    check(m.screenRight > 0, `${backend}: ${CHAR} faces screen-right`,
      `forward·cameraRight = ${m.screenRight}`);
    check(m.towardLens > 0, `${backend}: ${CHAR}'s front is toward the lens`,
      `forward·(-cameraFwd) = ${m.towardLens}`);
    // Three-quarter, not profile and not head-on: both components substantial.
    // This is the LOOK the sprite art is drawn at, so it is worth asserting.
    check(m.screenRight > 0.35 && m.towardLens > 0.35, `${backend}: the view is three-quarter`,
      `${m.screenRight} across / ${m.towardLens} toward`);
  }
  // FACING LEFT. render3d turns the model instead of mirroring the picture,
  // and the yaw that takes has to come from the camera: a flat 180° reads as
  // a turnaround only under a side-on camera, and under this ¾ one it handed
  // the viewer his back. Both conditions must survive the turn.
  const left = await page.evaluate(async (char) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const scene = await import("/render3d/src/scene.js");
    const pose = await import("/render3d/src/pose.js");
    const rig = rigs.getRig(char);
    if (!rig) return null;
    // Pose directly: renderPose would cache-hit and leave the rig standing in
    // whatever the previous check posed it as — which is how this check first
    // reported a pass it had not earned.
    scene.renderPose(char, "idle", 0.1, rig, rigs.resolveClip(char, "idle"), { turnYawRad: 0 });
    pose.poseRig(rig, "idle", 0.1, rigs.resolveClip(char, "idle").clip,
      { turnYawRad: scene.turnaroundYaw() });
    rig.root.updateMatrixWorld(true);
    const cam = scene.__cam();
    const heel = rig.root.getObjectByName("LeftFoot");
    const toe = rig.root.getObjectByName("LeftToeBase") || heel;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    heel.getWorldPosition(a); toe.getWorldPosition(b);
    const fwd = b.sub(a); fwd.y = 0; fwd.normalize();
    const camFwd = new THREE.Vector3(); cam.getWorldDirection(camFwd);
    camFwd.y = 0; camFwd.normalize();
    const camRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    camRight.y = 0; camRight.normalize();
    return { screenRight: +fwd.dot(camRight).toFixed(3), towardLens: +(-fwd.dot(camFwd)).toFixed(3) };
  }, CHAR);
  if (left) {
    check(left.screenRight < 0, `render3d: turned around, ${CHAR} faces screen-LEFT`,
      `forward·cameraRight = ${left.screenRight}`);
    check(left.towardLens > 0, "...with his front still toward the lens",
      `forward·(-cameraFwd) = ${left.towardLens} (a flat 180° gives a negative here — his back)`);
  }

  // The live layers must NOD, not twist. Same class of fault as the camera
  // yaw and equally invisible at 384 px: before this was fixed the look-at
  // layer produced 14.8 degrees of pure ROLL and no pitch at all — the head
  // lolling sideways, which is what "his head rotates in a funny way" was.
  const head = await page.evaluate(async (char) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const rig = rigs.getRig(char);
    if (!rig || !rig.root.getObjectByName("Head")) return null;
    const clip = rigs.resolveClip(char, "idle");
    const axes = () => {
      const q = rig.root.getObjectByName("Head").getWorldQuaternion(new THREE.Quaternion());
      return ["x", "y", "z"].map((_, i) =>
        new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(q));
    };
    const snap = (lookRad) => {
      pose.poseRig(rig, "idle", 0.1, clip.clip, { lookRad, turnYawRad: 0 });
      rig.root.updateMatrixWorld(true);
      return axes();
    };
    const [r0, u0, f0] = snap(0);
    const [r1, u1, f1] = snap(0.4);
    const delta = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(r1, u1, f1)
        .multiply(new THREE.Matrix4().makeBasis(r0, u0, f0).invert()));
    const e = new THREE.Euler().setFromQuaternion(delta, "YXZ");
    const deg = (r) => +Math.abs(r * 180 / Math.PI).toFixed(2);
    return { pitch: deg(e.x), yaw: deg(e.y), roll: deg(e.z) };
  }, CHAR);
  if (head) {
    check(head.pitch > 5, "the look-at layer pitches the head",
      `${head.pitch}° of nod`);
    check(head.yaw < 1 && head.roll < 1, "...and only pitches it",
      `${head.yaw}° yaw, ${head.roll}° roll`);
  }

  // THE STAND-IN MUST NOT INHERIT THE DELIVERY'S ERRORS. A mannequin is built
  // to spec — facing +Z, its own declared height — so the corrections that
  // describe one .glb (which way that model was built, how tall it measures,
  // how heavy a line its costume wants) do not apply to it. They were applied,
  // and the result was a stand-in that stood turned 80° while Dagon's model
  // downloaded and then snapped straight: the body you look at to decide
  // whether the orientation data is right, lying about the orientation.
  // Asked on the WORKBENCH, which fetches one fighter at a time: a character
  // nobody has selected is still a stand-in there, so this is a fact to read
  // rather than a race to win.
  await page.goto(`${BASE}/render3d/workbench/?char=${CHAR}`);
  await page.waitForFunction(() => window.__workbenchReady === true, { timeout: 120000 });
  const standIn = await page.evaluate(async (self) => {
    const rigs = await import("/render3d/src/loader.js");
    const man = rigs.rigManifest();
    const worst = Object.entries(man.characters || {})
      .filter(([c, e]) => c !== self && e?.model && Math.abs(Number(e.yawOffsetDeg) || 0) > 0)
      .sort((a, b) => Math.abs(b[1].yawOffsetDeg) - Math.abs(a[1].yawOffsetDeg))[0];
    if (!worst) return null;
    const [char, entry] = worst;
    const rig = rigs.getRig(char);
    if (!rig) return null;
    return { char, manifestYaw: entry.yawOffsetDeg, isMannequin: !!rig.isMannequin,
             yaw: rig.yawOffsetDeg, scale: rig.renderScale, stance: rig.stanceDeg,
             manifestStance: Number(entry.stanceDeg) || 0 };
  }, CHAR);
  if (standIn) {
    check(standIn.isMannequin,
      `${standIn.char} is still a stand-in on a workbench showing ${CHAR}`,
      standIn.isMannequin ? "" : "their .glb loaded — the check below is weaker than it looks");
    check(standIn.yaw === 0 && standIn.scale === 1,
      `a mannequin standing in for ${standIn.char} ignores the delivery's corrections`,
      `manifest says ${standIn.manifestYaw}° / their model's scale; stand-in is at ${standIn.yaw}° / ${standIn.scale}×`);
    check(standIn.stance === standIn.manifestStance,
      "...but keeps the stance, which is the character's and not the file's",
      `${standIn.stance}°`);
  }
} catch (err) {
  check(false, "smoke_facing ran", err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failure(s)` : "\nall facing checks passed");
process.exit(failures ? 1 : 0);
