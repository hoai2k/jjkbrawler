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
  await page.goto(`${BASE}/index.html?render=3d&mannequin=none`);
  await page.waitForFunction(
    async () => (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 60000 });

  const measured = await page.evaluate(async (char) => {
    const THREE = await import("/vendor/three/three.module.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    const out = {};

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
        out["render3d"] = measure(rig, scene.__cam());
      }
    }
    {
      const rigMod = await import("/billboards/src/rig.js");
      const renderer = await import("/billboards/src/renderer.js");
      const { CHARACTER_KEYS } = await import("/src/characters.js");
      renderer.initRenderer(THREE);
      await rigMod.initRigs(THREE, GLTFLoader, [], CHARACTER_KEYS);
      const rig = rigMod.getRig(char);
      if (rig) {
        renderer.renderPose(char, "idle", 0.1, rigMod.resolveClip);
        out["billboard"] = measure(rig, renderer.__cam());
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
} catch (err) {
  check(false, "smoke_facing ran", err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failure(s)` : "\nall facing checks passed");
process.exit(failures ? 1 : 0);
