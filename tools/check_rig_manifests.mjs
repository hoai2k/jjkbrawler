// The two model backends describe the same rigs, so they must agree about them.
//
// `?render=billboard` and `?render=3d` load BYTE-IDENTICAL .glb files, under
// cameras set to the same -60° yaw, from two manifests that list the same 27
// characters. Everything in those manifests that describes the MODEL — which
// file it is, how tall it is, whether it passed review, and which way it faces
// — is therefore one fact recorded twice, and the two copies drifted: a review
// pass turned 22 fighters in the render3d manifest and the billboard one was
// never touched, so the same fighter faced two different directions depending
// on which backend drew them. Nothing failed; they just looked different, and
// only a side-by-side would tell you.
//
// What is allowed to differ is anything about the LOOK, because the backends
// genuinely differ there: render3d runs the anime pass (toon.js), and the
// billboard path has no material pass at all today. So `toon` is render3d's
// alone, and this deliberately does not compare it.
//
//     node tools/check_rig_manifests.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
  if (!ok) failed += 1;
};

const r = read("render3d/assets/manifest.json").characters || {};
const b = read("billboards/assets/manifest.json").characters || {};

// Facts about the model. `toon` is NOT here — see the note above.
const SHARED = ["model", "heightM", "approved", "yawOffsetDeg", "renderScale", "stanceDeg"];

const keys = [...new Set([...Object.keys(r), ...Object.keys(b)])].sort();
const missing = keys.filter((k) => !(k in r) || !(k in b));
check(missing.length === 0, "both backends register the same characters",
  missing.length ? `only one has: ${missing.join(", ")}` : `${keys.length} character(s)`);

const disagree = [];
for (const key of keys) {
  if (!(key in r) || !(key in b)) continue;
  for (const field of SHARED) {
    const rv = r[key][field];
    const bv = b[key][field];
    // Both absent is agreement — a rig that honours the delivery spec needs no
    // correction recorded on either side.
    if (rv === undefined && bv === undefined) continue;
    if (JSON.stringify(rv) !== JSON.stringify(bv)) {
      disagree.push(`${key}.${field}: render3d ${JSON.stringify(rv)} vs billboard ${JSON.stringify(bv)}`);
    }
  }
}
check(disagree.length === 0,
  "…and agree on every fact about the model itself",
  disagree.length ? disagree.slice(0, 6).join(" | ") + (disagree.length > 6 ? ` (+${disagree.length - 6} more)` : "")
                  : SHARED.join(", "));

// The model paths are relative to each backend's own assets root, so agreeing
// on the string is only half of it — the files themselves have to be there.
const gone = [];
for (const key of keys) {
  for (const [backend, man] of [["render3d", r], ["billboards", b]]) {
    const file = man[key]?.model;
    if (file && !fs.existsSync(path.join(ROOT, backend, "assets", file))) {
      gone.push(`${backend}/${file}`);
    }
  }
}
check(gone.length === 0, "every model a manifest names is on disk",
  gone.length ? gone.slice(0, 4).join(", ") : `${keys.length * 2} file(s)`);

console.log(failed ? `\n${failed} check(s) failed` : "\nthe two rig manifests agree");
process.exit(failed ? 1 : 0);
