#!/usr/bin/env python3
"""What shape is each delivered rig in, before anything poses it?

    python3 tools/audit_rig_quality.py             # the whole roster
    python3 tools/audit_rig_quality.py jogo panda  # named rigs
    python3 tools/audit_rig_quality.py --csv       # machine-readable

STATIC ONLY, and that is the point. `smooth_skin_weights.py`'s tearing measure
and `audit_arm_drag.py`'s drag measure both need the engine to pose the rig;
this needs nothing but the file, so it runs on a delivery the moment it lands
and it can be read next to the pose-time numbers without a server.

WHAT IT MEASURES, and why each one is worth a column:

  skeleton    joints, and whether the names are the ones the engine looks for.
              `pose.js` and `ik.js` find bones BY NAME — `getObjectByName("Hips")`
              — so a joint called `mixamorig:Hips` is a joint no layer can
              reach, however correct the file is.

  infl        the average number of bones driving a vertex, and how many
              vertices are driven by exactly ONE. A rigid vertex next to a
              blended one is a crease; a limb bound entirely rigid is a
              cardboard cutout that cannot bend.

  sum         how far the weights are from summing to 1. glTF does not require
              it and renderers differ on whether they normalise, so a rig that
              sums to 0.8 is a rig that renders differently in two viewers.

  span L/R    the arm chain's bone length, left over right. A rig built by
              mirroring should be 1.000; anything else is either an authored
              asymmetry or a symmetrize that went wrong.

  scale       any bone whose rest scale is not 1. A scaled bone scales
              everything under it, and the pose layers all assume 1.

  shells      connected components of the mesh. These are generated bodies and
              a couple of hundred is normal — a patchwork, not a manifold — but
              it is the number that decides whether a hole can be filled.

  verts/tris  size, so a rig that is an order of magnitude off the roster shows
              up as one.
"""

import argparse
import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_arm_drag import ASSETS, accessor, globals_of, read_glb   # noqa: E402

# The names every pose layer reaches for. Missing one is not fatal — the layers
# guard — but each miss is a layer that silently does nothing on that fighter.
CORE = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
        "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
        "RightShoulder", "RightArm", "RightForeArm", "RightHand",
        "LeftUpLeg", "LeftLeg", "LeftFoot",
        "RightUpLeg", "RightLeg", "RightFoot"]
ARM = {"left": ("LeftArm", "LeftForeArm", "LeftHand"),
       "right": ("RightArm", "RightForeArm", "RightHand")}


def measure(char):
    path = ASSETS / char / f"{char}.glb"
    if not path.exists():
        return None
    gltf, blob = read_glb(path)
    if not gltf.get("skins") or not gltf.get("meshes"):
        return None
    nodes = gltf["nodes"]
    name_of = [nd.get("name", "") for nd in nodes]
    joints = gltf["skins"][0]["joints"]
    jnames = [name_of[j] for j in joints]
    world = globals_of(gltf)
    wp = {i: (m[3], m[7], m[11]) for i, m in world.items()}

    missing = [b for b in CORE if b not in name_of]
    odd = sorted(n for n in jnames if ":" in n or "mixamo" in n.lower())
    scaled = sorted({name_of[i] for i, nd in enumerate(nodes)
                     if any(abs(s - 1) > 1e-3 for s in (nd.get("scale") or (1, 1, 1)))}
                    & set(jnames))

    def span(side):
        bones = ARM[side]
        total = 0.0
        for a, b in zip(bones, bones[1:]):
            if a in name_of and b in name_of:
                total += math.dist(wp[name_of.index(a)], wp[name_of.index(b)])
        return total

    sl, sr = span("left"), span("right")

    verts = tris = 0
    infl_sum = rigid = 0
    worst_sum = 0.0
    shells = 0
    ys = []
    for mesh in gltf["meshes"]:
        for prim in mesh.get("primitives", []):
            at = prim.get("attributes", {})
            if "JOINTS_0" not in at or "WEIGHTS_0" not in at:
                continue
            ws = accessor(gltf, blob, at["WEIGHTS_0"])
            pos = accessor(gltf, blob, at["POSITION"])
            ys.extend(p[1] for p in pos)
            verts += len(ws)
            for w in ws:
                n = sum(1 for x in w if x > 0.02)
                infl_sum += n
                if n <= 1:
                    rigid += 1
                worst_sum = max(worst_sum, abs(sum(w) - 1.0))
            if "indices" in prim:
                idx = [x[0] for x in accessor(gltf, blob, prim["indices"])]
                tris += len(idx) // 3
                par = list(range(len(pos)))

                def find(x):
                    while par[x] != x:
                        par[x] = par[par[x]]
                        x = par[x]
                    return x

                for t in range(0, len(idx) - 2, 3):
                    a, b, c = (find(idx[t]), find(idx[t + 1]), find(idx[t + 2]))
                    if a != b:
                        par[a] = b
                    if find(idx[t + 2]) != find(idx[t]):
                        par[find(c)] = find(idx[t])
                seen = defaultdict(int)
                for v in range(len(pos)):
                    seen[find(v)] += 1
                shells += sum(1 for k, n in seen.items() if n >= 8)

    height = (max(ys) - min(ys)) if ys else 0
    return {
        "char": char, "joints": len(joints), "missing": missing, "odd": odd,
        "scaled": scaled, "spanL": sl, "spanR": sr,
        "lr": (sl / sr) if sr else 0.0,
        "verts": verts, "tris": tris, "shells": shells,
        "infl": infl_sum / verts if verts else 0,
        "rigidPct": 100.0 * rigid / verts if verts else 0,
        "sumErr": worst_sum, "height": height,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--csv", action="store_true")
    args = ap.parse_args()
    chars = args.chars or sorted(p.name for p in ASSETS.iterdir()
                                 if p.is_dir() and (p / f"{p.name}.glb").exists())
    rows = []
    for char in chars:
        try:
            r = measure(char)
        except Exception as err:
            print(f"{char:12} unreadable: {err}", file=sys.stderr)
            continue
        if r:
            rows.append(r)

    if args.csv:
        print("char,joints,missing,odd,scaled,spanL,spanR,lr,verts,tris,shells,"
              "infl,rigidPct,sumErr,height")
        for r in rows:
            print(f"{r['char']},{r['joints']},{'|'.join(r['missing'])},"
                  f"{'|'.join(r['odd'])},{'|'.join(r['scaled'])},"
                  f"{r['spanL']:.3f},{r['spanR']:.3f},{r['lr']:.3f},{r['verts']},"
                  f"{r['tris']},{r['shells']},{r['infl']:.2f},{r['rigidPct']:.1f},"
                  f"{r['sumErr']:.4f},{r['height']:.2f}")
        return 0

    print(f"{'char':12} {'jnt':>4} {'verts':>6} {'tris':>6} {'shell':>6} "
          f"{'infl':>5} {'rigid%':>7} {'sumErr':>7} {'span L/R':>9}  notes")
    for r in sorted(rows, key=lambda x: x["char"]):
        notes = []
        if r["missing"]:
            notes.append(f"missing {','.join(r['missing'])}")
        if r["odd"]:
            notes.append(f"unreachable name {','.join(r['odd'])}")
        if r["scaled"]:
            notes.append(f"scaled {','.join(r['scaled'])}")
        print(f"{r['char']:12} {r['joints']:4} {r['verts']:6} {r['tris']:6} "
              f"{r['shells']:6} {r['infl']:5.2f} {r['rigidPct']:7.1f} "
              f"{r['sumErr']:7.4f} {r['lr']:9.3f}  {'; '.join(notes)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
