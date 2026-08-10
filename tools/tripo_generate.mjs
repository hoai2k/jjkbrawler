#!/usr/bin/env node
// Generate a rigged character model from 2D art, via the Tripo API.
//
// This is the step the pipeline was missing. The repo already had everything
// downstream — blender_conform.py to force a delivery into spec, and
// billboard_intake.mjs to validate/import/approve it — but "get a .glb from a
// generator" was a manual errand. It is 28 fighters of errand, so it is a
// script.
//
//     export TRIPO_API_KEY=tsk_...          # never pass it on the command line
//     node tools/tripo_generate.mjs yuji
//     node tools/tripo_generate.mjs yuji --image path/to/other.png --backend 3d
//
// Output lands at <backend>/intake/<char>/_raw.glb — the input side of
// blender_conform.py, which is the next step it prints.
//
// ---------------------------------------------------------------------------
// TWO THINGS THAT COST AN AFTERNOON TO FIND, both pinned below as constants:
//
//  1. RIGGING MUST USE THE v1.0 MODEL. The rig API takes `spec: "mixamo"`,
//     which is what this repo's whole skeleton contract is built on
//     (billboards/docs/asset-requests.md: Mixamo-style bone naming, and
//     blender_conform.py strips the `mixamorig:` prefix). On the CURRENT rig
//     model (v2.5) that flag is accepted, echoed back in the task record, and
//     then ignored — the .glb comes out with `tripo::Spine_0` and `bone_14`,
//     names nothing can retarget onto, and `validate` rejects the rig with
//     "missing standard bones". On v1.0 the same request returns a clean
//     `mixamorig:` skeleton with all 22 bones the validator wants. Asking for
//     FBX instead does not help; the naming is the rig model's, not the
//     exporter's.
//
//  2. The two halves live on DIFFERENT API VERSIONS. Generation is v2
//     (api.tripo3d.ai/v2/openapi, poll GET /task/{id}); rigging is v3
//     (openapi.tripo3d.ai/v3/animations/rig, poll GET /v3/tasks/{id}). The
//     v3 task id is not queryable on v2 or vice versa.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const V2 = "https://api.tripo3d.ai/v2/openapi";
const V3 = "https://openapi.tripo3d.ai/v3";

// See note 1 above. Do not "upgrade" this without re-checking the bone names
// in the output — the failure is silent until intake rejects the rig.
const RIG_MODEL = "v1.0-20240301";

// The delivery spec's mesh budget (≤30k tris standard build).
const FACE_LIMIT = 30000;

const KEY = process.env.TRIPO_API_KEY;
if (!KEY) {
  console.error("TRIPO_API_KEY is not set. Export it; do not pass it as an argument —\n"
    + "a key on the command line lands in shell history and in process listings.");
  process.exit(2);
}

const argv = process.argv.slice(2);
const backend = argv.includes("--backend") ? argv[argv.indexOf("--backend") + 1] : "billboard";
const DIR = backend === "3d" ? "render3d" : "billboards";
const imageArg = argv.includes("--image") ? argv[argv.indexOf("--image") + 1] : null;
const char = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--image"
  && argv[argv.indexOf(a) - 1] !== "--backend");
if (!char) {
  console.error("usage: tripo_generate.mjs <char> [--image <png>] [--backend 3d]");
  process.exit(2);
}

/** The fighter's canonical appearance reference — the same image every 2D
 *  round is matched against, and the best single seed we have: full body,
 *  relaxed, clean alpha. */
const defaultImage = join(ROOT, "assets/reference/canon", `${char}_idle.png`);
const imagePath = imageArg ? join(ROOT, imageArg) : defaultImage;

const auth = { Authorization: `Bearer ${KEY}` };

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`${url.replace(/https:\/\/[^/]+/, "")} -> ${body.code} ${body.message || ""}`
      + (body.suggestion ? ` (${body.suggestion})` : ""));
  }
  return body.data;
}

/** Poll until a task leaves the running states. `v3` selects which task
 *  endpoint to ask, because the two halves do not share an id space. */
async function waitFor(taskId, { v3 = false, label = "task" } = {}) {
  const url = v3 ? `${V3}/tasks/${taskId}` : `${V2}/task/${taskId}`;
  for (let i = 0; i < 240; i++) {
    const d = await api(url);
    if (["success", "failed", "banned", "cancelled", "expired"].includes(d.status)) {
      if (d.status !== "success") throw new Error(`${label} ${d.status}`);
      return d;
    }
    process.stdout.write(`\r  ${label}: ${d.status} ${d.progress ?? ""}%   `);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} did not finish`);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (!existsSync(imagePath)) throw new Error(`no seed image at ${imagePath}`);
  console.log(`seed: ${imagePath.replace(ROOT + "/", "")}`);

  // 1. Upload. Multipart field is `file`; the token comes back as image_token.
  const form = new FormData();
  form.append("file", new Blob([readFileSync(imagePath)], { type: "image/png" }), `${char}.png`);
  const up = await api(`${V2}/upload`, { method: "POST", body: form });
  const token = up.image_token;
  console.log(`uploaded  ${token}`);

  // 2. Mesh. pbr:false because the delivery spec wants baseColor only — the
  //    engine's toon pass supplies all shading, and anything pre-lit fights it.
  const gen = await api(`${V2}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "image_to_model",
      file: { type: "png", file_token: token },
      face_limit: FACE_LIMIT,
      texture: true,
      pbr: false,
    }),
  });
  console.log(`mesh task ${gen.task_id}`);
  await waitFor(gen.task_id, { label: "mesh" });
  console.log("\nmesh done");

  // 3. Rig. See note 1: the model version is the whole ballgame.
  const rig = await api(`${V3}/animations/rig`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: gen.task_id,
      model: RIG_MODEL,
      rig_type: "biped",
      spec: "mixamo",
      out_format: "glb",
    }),
  });
  console.log(`rig task  ${rig.task_id}`);
  const done = await waitFor(rig.task_id, { v3: true, label: "rig" });
  console.log("\nrig done");

  const outDir = join(ROOT, DIR, "intake", char);
  mkdirSync(outDir, { recursive: true });
  const raw = join(outDir, "_raw.glb");
  await download(done.output.model_url, raw);

  // Fail loudly here rather than three steps later: if the rig came back with
  // generator-native bone names, nothing downstream can retarget onto it.
  const buf = readFileSync(raw);
  const gltf = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  const names = (gltf.nodes || []).map((n) => n.name || "");
  const mixamo = names.filter((n) => n.startsWith("mixamorig:")).length;
  console.log(`\nwrote ${raw.replace(ROOT + "/", "")}  (${mixamo} mixamorig bones)`);
  if (mixamo < 20) {
    console.error(`\nWARNING: only ${mixamo} mixamorig bones — the rig model ignored spec:mixamo.\n`
      + `Bone names look like: ${names.filter(Boolean).slice(0, 4).join(", ")}\n`
      + `See note 1 at the top of this file; intake will reject this rig.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nnext:\n  <blender> --background --python tools/blender_conform.py -- \\`
    + `\n      --in ${DIR}/intake/${char}/_raw.glb --out ${DIR}/intake/${char}/${char}.glb --char ${char}`
    + `\n  node tools/billboard_intake.mjs validate ${char}${backend === "3d" ? " --backend 3d" : ""}`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
