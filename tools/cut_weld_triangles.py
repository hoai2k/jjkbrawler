#!/usr/bin/env python3
"""Cut the membrane a generator built between an arm and the body.

    python3 tools/cut_weld_triangles.py                # what it would cut, roster-wide
    python3 tools/cut_weld_triangles.py jogo           # one fighter
    python3 tools/cut_weld_triangles.py --apply jogo   # write the .glb

WHAT A WELD IS — the same fault `tools/cut_fused_limb.py` was written for, and
the same description fits: "Tripo reconstructs a body from flat boards. Where
an arm rests against the ribs in the source art it has no way to know the two
are separate things, so it builds ONE surface across the gap... In the bind it
is nearly invisible. It is the ANIMATION that exposes it. Raise the arm and
the sheet stretches with it: a black membrane from wrist to waist."

That is the far-arm report of the guard-hands review, in six fighters' words:
"deformed and huge", "really long and bent strangely", "long and bendy",
"pulling body geometry along with it", "pulling along black geometry that
should be white". It is most visible in the guard because the guard is the
pose that lifts the far arm across the body, and it is invisible in the idle
because in the idle the arm is down and the sheet is a fold.

WHY THE EARLIER PASSES MISSED IT. Three went looking at WEIGHTS:
`audit_arm_weights.py` counted vertices per chain; `audit_arm_drag.py` turned
each arm and asked what other bones' geometry came along; a third measured how
far an arm-dominated vertex sits from its own bone. None separated the flagged
six, and none could have: the membrane's weights are not wrong. A vertex
halfway across the gap is honestly half arm and half rib, which is what the
binder saw. The geometry is wrong. There should be no vertex there at all.

SO MEASURE THE GEOMETRY, POSED. Skin the mesh twice — once in the idle, once
in the guard — and compare every triangle's AREA. Skin does not change area
much; a membrane spanning a gap that opens does nothing else. Triangles that
grow more than 3x, per fighter:

    jogo       512   worst 53x     <- flagged      momo        19   worst  8x
    panda      287   worst 92x     <- flagged      maki        48   worst  9x
    gakuganji  233   worst 40x     <- flagged
    todo       122   worst 64x     <- flagged

and the bones that own them are exactly the pair a membrane spans — LeftArm
and Spine.

THE RULE. A triangle is cut when BOTH:

  * it grows more than GROW_MIN times its idle area in the guard, and
  * its corners are owned by bones from body parts that do not touch — an arm
    corner and a trunk-or-leg corner. Real surface does not bridge a forearm
    to a hip; only a sheet across a gap does.

The second half is what keeps this off legitimate geometry. An armpit
triangle grows too, and it has an arm corner and a SHOULDER corner, which are
adjacent parts and therefore kept. The parts are Arm-L, Arm-R, Trunk, Leg-L,
Leg-R, Head, and adjacency is spelled out in TOUCHES below.

WHAT IS LEFT BEHIND. A hole, deliberately, and `cut_fused_limb.py` is emphatic
about why: "DO NOT RUN fill_model_holes.py AFTERWARDS WITHOUT LOOKING. It is
the right tool for a tear and the wrong one for this: the rim a weld leaves
behind spans the gap the weld was filling, so capping it rebuilds the
membrane." The body under the sheet is a closed surface where it matters.

Triangles are dropped from the index buffer only; no vertex, weight or texture
is touched, and the new indices go into a fresh bufferView appended to the
blob so nothing else that shares the old one is disturbed.

Needs a running server (`node server.mjs`) and playwright, because the poses
come from the engine — the same reason `audit_strike_reach.mjs` does.
"""

import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_arm_drag import ASSETS, accessor, read_glb   # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GROW_MIN = 3.0
BLOAT = 50.0            # times the median triangle's rest area
FLAGGED = {"panda", "todo", "jogo", "sukuna", "gakuganji", "yuki"}

PART = {}
for _b in ("LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"):
    PART[_b] = "armL"
for _b in ("RightShoulder", "RightArm", "RightForeArm", "RightHand"):
    PART[_b] = "armR"
for _b in ("Hips", "mixamorig:Hips", "Spine", "Spine1", "Spine2", "Neck"):
    PART[_b] = "trunk"
for _b in ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"):
    PART[_b] = "legL"
for _b in ("RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"):
    PART[_b] = "legR"
PART["Head"] = "head"

# Which parts share a real surface. A shoulder and a chest do; a forearm and a
# hip do not, and neither do two arms. Symmetric; a part always touches itself.
TOUCHES = {
    ("armL", "trunk"), ("armR", "trunk"), ("head", "trunk"),
    ("legL", "trunk"), ("legR", "trunk"), ("legL", "legR"),
}


def parts_touch(a, b):
    return a == b or (a, b) in TOUCHES or (b, a) in TOUCHES


# The membrane's two ends. An arm corner paired with a trunk corner is the
# armpit and is kept; an arm corner paired with a LEG corner, or with the other
# arm, is a sheet. The arm/trunk case is caught by the growth test plus the
# hand rule below rather than by adjacency, because the armpit is genuinely
# arm-to-trunk surface.
FAR_FROM_TRUNK = {"LeftForeArm", "LeftHand", "RightForeArm", "RightHand"}

PROBE = r"""
import { chromium } from "playwright";
const [BASE, CHAR, OUT] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH
    || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.goto(`${BASE}/index.html?render=3d&camera=flat`, { waitUntil: "load" });
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 90000 });
const res = await page.evaluate(async (charKey) => {
  const pose = await import("/render3d/src/pose.js");
  const loader = await import("/render3d/src/loader.js");
  const rig = loader.getRig(charKey);
  if (!rig?.root) return null;
  const V = rig.root.position.constructor;
  const M = rig.root.matrixWorld.constructor;
  let mesh = null;
  rig.root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const sk = mesh.skeleton;
  const posA = mesh.geometry.attributes.position;
  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  const idxA = mesh.geometry.index;
  const skinAll = (state) => {
    const resolved = loader.resolveClip(charKey, state);
    pose.poseRig(rig, state, 0, resolved.clip,
      { charKey, presentMirror: true, facing: 1, facingK: 1, turnYawRad: 0 });
    rig.root.updateMatrixWorld(true);
    const mats = sk.bones.map((b, j) =>
      new M().multiplyMatrices(b.matrixWorld, sk.boneInverses[j]));
    const P = new Float64Array(posA.count * 3);
    const v = new V(), acc = new V();
    for (let i = 0; i < posA.count; i++) {
      acc.set(0, 0, 0);
      let tot = 0;
      for (let k = 0; k < 4; k++) tot += sw.getComponent(i, k);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w <= 0.001) continue;
        v.fromBufferAttribute(posA, i).applyMatrix4(mesh.bindMatrix)
          .applyMatrix4(mats[si.getComponent(i, k)]);
        acc.addScaledVector(v, w / (tot || 1));
      }
      P[i * 3] = acc.x; P[i * 3 + 1] = acc.y; P[i * 3 + 2] = acc.z;
    }
    return P;
  };
  const A = skinAll("idle"), B = skinAll("shield");
  const area = (P, a, b, c) => {
    const ux = P[b*3]-P[a*3], uy = P[b*3+1]-P[a*3+1], uz = P[b*3+2]-P[a*3+2];
    const vx = P[c*3]-P[a*3], vy = P[c*3+1]-P[a*3+1], vz = P[c*3+2]-P[a*3+2];
    const cx = uy*vz-uz*vy, cy = uz*vx-ux*vz, cz = ux*vy-uy*vx;
    return 0.5 * Math.hypot(cx, cy, cz);
  };
  const n = idxA ? idxA.count : posA.count;
  const rest = [], posed = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const a = idxA ? idxA.getX(t) : t;
    const b = idxA ? idxA.getX(t+1) : t+1;
    const c = idxA ? idxA.getX(t+2) : t+2;
    rest.push(area(A, a, b, c));
    posed.push(area(B, a, b, c));
  }
  return { bones: sk.bones.map((b) => b.name), rest, posed };
}, CHAR);
await browser.close();
const fs = await import("fs");
fs.writeFileSync(OUT, JSON.stringify(res));
"""


def growth(char, base):
    """Per-triangle idle->guard area ratio, from the engine."""
    # The probe lives in the repo rather than in /tmp: node resolves bare
    # imports (playwright) relative to the SCRIPT, so a script outside the
    # tree cannot see node_modules.
    with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
        script = os.path.join(tmp, "probe.mjs")
        out = os.path.join(tmp, "out.json")
        with open(script, "w", encoding="utf-8") as fh:
            fh.write(PROBE)
        r = subprocess.run([ "node", script, base, char, out],
                           cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"{char}: probe failed\n{r.stderr[-800:]}")
        with open(out, encoding="utf-8") as fh:
            return json.load(fh)


def cut(char, base, apply_it=False):
    path = ASSETS / char / f"{char}.glb"
    if not path.exists():
        return None
    got = growth(char, base)
    if not got:
        return None
    rest, posed = got["rest"], got["posed"]
    if not rest:
        return None
    med = sorted(rest)[len(rest) // 2] or 1e-12

    gltf, blob = read_glb(path)
    prim = gltf["meshes"][0]["primitives"][0]
    idx = [x[0] for x in accessor(gltf, blob, prim["indices"])]

    keep = []
    dropped = 0
    area_cut = 0.0
    for t in range(0, len(idx) - 2, 3):
        i = t // 3
        a0, a1 = (rest[i], posed[i]) if i < len(rest) else (0.0, 0.0)
        if a0 > 1e-12 and a1 / a0 >= GROW_MIN and a1 >= BLOAT * med:
            dropped += 1
            area_cut += a1
            continue
        keep.extend(idx[t:t + 3])

    if apply_it and dropped:
        acc = gltf["accessors"][prim["indices"]]
        fmt = {5121: "B", 5123: "H", 5125: "I"}[acc["componentType"]]
        packed = struct.pack(f"<{len(keep)}{fmt}", *keep)
        buf = bytearray(blob)
        off = len(buf)
        buf += packed + b"\0" * (-len(packed) % 4)
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": off,
                                    "byteLength": len(packed), "target": 34963})
        acc["bufferView"] = len(gltf["bufferViews"]) - 1
        acc["byteOffset"] = 0
        acc["count"] = len(keep)
        gltf["buffers"][0]["byteLength"] = len(buf)
        text = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        text += b" " * (-len(text) % 4)
        body = bytes(buf) + b"\0" * (-len(buf) % 4)
        with open(path, "wb") as fh:
            fh.write(struct.pack("<III", 0x46546C67, 2,
                                 12 + 8 + len(text) + 8 + len(body)))
            fh.write(struct.pack("<II", len(text), 0x4E4F534A))
            fh.write(text)
            fh.write(struct.pack("<II", len(body), 0x004E4942))
            fh.write(body)

    total = sum(posed) or 1.0
    return {"tris": len(idx) // 3, "dropped": dropped,
            "cm2": round(area_cut * 1e4), "pct": round(100 * area_cut / total, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--base", default="http://127.0.0.1:5174")
    args = ap.parse_args()
    chars = args.chars or sorted(p.name for p in ASSETS.iterdir()
                                 if p.is_dir() and (p / f"{p.name}.glb").exists())
    print("a sheet is a triangle that both GREW past 3x its idle area and is "
          "now\nenormous — 50x the median triangle. A skin has none.\n")
    print(f"{'char':12} {'tris':>7} {'sheet':>6} {'cm2':>7} {'% skin':>7}  flag")
    for char in chars:
        try:
            r = cut(char, args.base, args.apply)
        except SystemExit as err:
            print(f"{char:12} {err}", file=sys.stderr)
            continue
        if not r:
            continue
        print(f"{char:12} {r['tris']:7} {r['dropped']:6} {r['cm2']:7} {r['pct']:7}  "
              f"{'<-- flagged' if char in FLAGGED else ''}"
              f"{'   WROTE' if args.apply and r['dropped'] else ''}")
    if not args.apply:
        print("\ndry run — pass --apply to write the .glb files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
