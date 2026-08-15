// PUT THE CORRECTIONS INTO THE MODELS, and take them out of the engine.
//
// *** NOT FINISHED — THE RE-SKIN IS WRONG. ***
// The pose handover works: after two goes it puts every bone where the engine
// says (Yuji's head lands within 5mm of where the correction layer had it, his
// shoulders level to 0.00cm). What does not work is making that pose the REST
// pose. The recipe here — apply a duplicate of the armature modifier to bake
// the deformation into the mesh, then `pose.armature_apply` — leaves the
// skeleton right and the skin smeared, as if the mesh were deformed twice.
// Do not run this with --apply on anything you have not backed up.
//
//   node server.mjs &
//   node tools/bake_model_fixes.mjs                 # what would be baked
//   node tools/bake_model_fixes.mjs --apply         # bake the roster
//   node tools/bake_model_fixes.mjs --apply yuji    # one fighter
//
// Every fighter is drawn with a layer of corrections on top of their delivered
// .glb — a mirrored skeleton, a head tilted back, arm roots pushed out, a
// clavicle rolled, a root yawed round. They are facts about the FILE, and the
// engine has been applying them on every frame of every state because the file
// does not. This is the step that ends that: the corrections go into the .glb,
// the numbers come out of the manifest, and `setModelFixesEnabled(false)` stops
// changing anything.
//
// WHY IT ASKS THE BROWSER. The corrections are defined by the engine — by
// `bakedBind` in render3d/src/pose.js, which puts a rig into the bind and runs
// the correction layer over it with no pose on top. A baking tool that
// reimplemented that arithmetic in Blender would be a second opinion about
// what the fix is, and the first time the two drifted the bake would silently
// stop matching the game. So this drives a real page, calls the real function,
// and writes down the answer: a corrected local transform per bone. Blender's
// only job is to make that the rest pose and re-skin the mesh to match.
//
// WHAT IS BAKED AND WHAT IS NOT.
//
//   BAKED, because they change the SHAPE of the model:
//     the mirrored skeleton, headTiltDeg, shoulderOutCm, kneeDeg, RIG_FIXES
//       — all of them are bone transforms, so they bake as one rest pose
//     yawOffsetDeg — the whole rig turned about Y
//
//   NOT BAKED: renderScale. It is not a defect in the model. The .glb is the
//   size it is; `renderScale` says how big the fighter is DRAWN, and the blit
//   divides it by `heightM` (blit.js). Baking it would mean scaling the
//   geometry — which would also have to scale every delivered clip's
//   translation track, for a number that has no effect on the model's shape.
//   It stays in the manifest, and is reclassified there as a display
//   calibration rather than a correction owed by the file.
//
// WHY THE CLIPS SURVIVE. A clip track holds a bone's LOCAL rotation, which is
// absolute — change the rest pose and the same track still puts the bone at
// the same orientation. What changes is where the SKIN sits relative to it,
// which is the whole point. And 702 of the roster's 729 state-clips are built
// from the sprite poses at load time anyway (loader.js), so they are rebuilt
// against the new bind for free; the 27 that are delivered are one idle each.
import { webkit } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d/assets/manifest.json");
const BLENDER = process.env.BLENDER
  || join(process.env.SCRATCH || "/tmp", "blender/blender");

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => !a.startsWith("-") && !a.startsWith("http")));

/** The Blender half: make the handed-in pose the rest pose, re-skin, turn the
 *  rig to face forward, and write the file back. */
const BAKE_PY = String.raw`
import bpy, sys, json, math
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, spec_path, dst = argv[0], argv[1], argv[2]
spec = json.load(open(spec_path))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"
          and any(m.type == "ARMATURE" for m in o.modifiers)]

# THE CORRECTED POSE, bone by bone, exactly as the engine computed it — as a
# matrix in the RIG's own space, which is the one description of a bone the two
# programs agree on. (Local transforms are not: glTF's are relative to the
# parent NODE, Blender's pose channels are relative to a rest bone with its own
# axis convention and roll. Handed the glTF ones, Blender built a rig with the
# head inside the chest.)
#
# The only conversion left is the world's: glTF is Y-up, Blender is Z-up, so a
# point (x, y, z) becomes (x, -z, y) and a transform M becomes C·M·C-inverse.
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
Cinv = C.inverted()

def as_blender(flat):
    # three.js hands back column-major; Blender's Matrix() takes rows.
    m = Matrix([[flat[c * 4 + r] for c in range(4)] for r in range(4)])
    return C @ m @ Cinv

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
missing = []
# Parents before children: setting pose_bone.matrix is read against the
# parent's CURRENT pose, so a child written first is written against a parent
# about to move.
order = sorted(spec["bones"].keys(),
               key=lambda n: len((arm.pose.bones.get(n).parent_recursive
                                  if arm.pose.bones.get(n) else [])))
for name in order:
    pb = arm.pose.bones.get(name)
    if pb is None:
        missing.append(name)
        continue
    pb.rotation_mode = "QUATERNION"
    pb.matrix = as_blender(spec["bones"][name])
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
if missing:
    print("BAKE-WARN missing bones: " + ",".join(missing[:8]))

# RE-SKIN — AND THIS IS THE PART THAT IS WRONG. The intent: applying a
# duplicate of the armature modifier bakes the current deformation into the
# mesh, and `pose.armature_apply` then makes that deformation the new zero, so
# the mesh sits where it was and the pose reads as rest. What comes out has the
# bones in the right places and the skin smeared across them. Candidates not
# yet ruled out: the duplicate is applied while the original still deforms
# (double deformation), shape keys blocking the apply on some meshes, or the
# exporter recomputing inverse-bind matrices against a hierarchy that has moved
# underneath them.
for m in meshes:
    bpy.context.view_layer.objects.active = m
    mod = next(x for x in m.modifiers if x.type == "ARMATURE")
    bpy.ops.object.modifier_copy(modifier=mod.name)
    dup = [x for x in m.modifiers if x.type == "ARMATURE"][-1]
    bpy.ops.object.modifier_apply(modifier=dup.name)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")

# THE ROOT YAW, last, on the object rather than the bones: the delivery was
# built facing somewhere other than +Z, and turning the whole rig is what the
# engine was doing every frame. Blender's Z is glTF's Y, so the turn is about Z
# here. Applied so the exported file carries no leftover object rotation.
yaw = math.radians(-spec.get("yawOffsetDeg", 0.0))
if yaw:
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm] + meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.rotation_mode = "XYZ"
    arm.rotation_euler[2] += yaw
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB",
                          export_animations=True, export_skins=True,
                          export_apply=False)
print("BAKE-OK")
`;

// ------------------------------------------------------------- ask the engine

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/render3d/workbench/index.html?edit=rigs`, { waitUntil: "load" });
await page.waitForFunction(() => window.__workbenchReady === true, {}, { timeout: 90000 });
await page.waitForTimeout(1500);

const keys = (await page.evaluate(() =>
  [...document.getElementById("charSelect").options].map((o) => o.value)))
  .filter((k) => !only.size || only.has(k));

const specs = [];
for (const char of keys) {
  const spec = await page.evaluate(async (key) => {
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const fixes = await import("/render3d/src/rig_fixes.js");
    const GL = (await import("/vendor/three/loaders/GLTFLoader.js")).GLTFLoader;
    await rigs.ensureRig(key, GL).catch(() => {});
    const rig = rigs.getRig(key);
    if (!rig || rig.isMannequin) return null;
    const entry = rigs.rigManifest().characters?.[key] || {};
    const bones = pose.bakedBind(rig, key);
    return {
      char: key,
      model: entry.model,
      yawOffsetDeg: entry.yawOffsetDeg || 0,
      pending: Object.keys(fixes.pendingFixes(key, entry)),
      bones,
    };
  }, char);
  if (spec) specs.push(spec);
}
await browser.close();
if (errors.length) console.log("page errors:", errors.slice(0, 3).join(" | "));

// ------------------------------------------------------------------- and bake

const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
console.log("fighter       bones  yaw   baking");
let baked = 0;
for (const spec of specs) {
  const entry = man.characters[spec.char];
  const willBake = spec.pending.filter((k) => k !== "renderScale");
  console.log(`${spec.char.padEnd(13)} ${String(Object.keys(spec.bones).length).padStart(5)}`
    + `  ${String(spec.yawOffsetDeg).padStart(3)}°  `
    + (willBake.length ? willBake.join(", ") : "nothing"));
  if (!apply || !willBake.length) continue;

  const tmp = mkdtempSync(join(tmpdir(), "bake-"));
  const specPath = join(tmp, "spec.json");
  const script = join(tmp, "bake.py");
  const out = join(tmp, "baked.glb");
  writeFileSync(specPath, JSON.stringify(spec));
  writeFileSync(script, BAKE_PY);
  const model = join(ROOT, "render3d/assets", spec.model);
  let log = "";
  try {
    log = execFileSync(BLENDER, ["-b", "--python", script, "--", model, specPath, out],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    console.log(`  ${spec.char}: blender failed — ${String(err).slice(0, 200)}`);
    continue;
  }
  if (!log.includes("BAKE-OK")) {
    console.log(`  ${spec.char}: blender did not finish\n${log.slice(-800)}`);
    continue;
  }
  for (const line of log.split("\n")) if (line.startsWith("BAKE-WARN")) console.log("  " + line);
  execFileSync("cp", [out, model]);
  // The numbers come OUT of the manifest in the same breath as they go into
  // the file. Leaving them would apply every correction twice.
  for (const k of ["yawOffsetDeg", "headTiltDeg", "shoulderOutCm", "kneeDeg"]) delete entry[k];
  entry.baked = true;
  baked++;
}

if (apply) {
  writeFileSync(MANIFEST, `${JSON.stringify(man, null, 2)}\n`);
  console.log(`\nbaked ${baked} fighter(s); manifest keys cleared.`);
  console.log("NOW PROVE IT: the layer off must change nothing —");
  console.log("    node tools/smoke_bake.mjs");
} else {
  console.log(`\n${specs.length} fighter(s) inspected; dry run — pass --apply to bake`);
}
