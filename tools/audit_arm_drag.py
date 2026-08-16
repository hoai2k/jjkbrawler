#!/usr/bin/env python3
"""What comes along when the far arm lifts — measured, without Blender.

    python3 tools/audit_arm_drag.py                # whole roster, worst first
    python3 tools/audit_arm_drag.py jogo panda     # named rigs
    python3 tools/audit_arm_drag.py --verbose jogo # which bones own the drag

WHY THIS EXISTS, and why it is not `audit_arm_weights.py`.

docs/blender-requests.md sets out the one test that decides what the far-arm
deformation IS: **rotate `LeftArm` alone and watch what moves.** If torso or
costume vertices travel with the arm, the weights are ASSIGNED wrong and
pruning them is the fix; if only arm vertices move and the limb still
distorts, they are DISTRIBUTED wrong and it is a re-bind. Those are different
jobs, and the doc reasonably assumes the test needs Blender and a person.

It does not. Linear blend skinning is arithmetic —

    v' = SUM_j  w_j * ( G_j * IBM_j ) * v

— so posing one joint and measuring what moved is a page of matrix code
against the same buffers `audit_arm_weights.py` already reads. This runs the
doc's test on all 28 rigs in a few seconds and says, per fighter, how much
geometry that does NOT belong to the arm chain rides along with it.

WHAT IT REPORTS, per side:

  drag verts  vertices that move more than 2% of the model's height when the
              arm alone is turned 60 degrees, and whose OWN dominant bone is
              outside the arm chain. On a clean bind this is near zero: a
              sleeve belongs to the arm and a hip does not.
  drag frac   those as a fraction of every vertex the arm chain influences.
  worst       how far the furthest dragged vertex travels, as a fraction of
              height — the difference between a shoulder seam creeping and a
              trouser leg being towed across the body.
  owners      (--verbose) which bones those dragged vertices actually belong
              to, commonest first. This is the line that names the fault:
              `RightUpLeg` under a left arm is a mis-assignment, `Spine2` in
              small numbers is a shoulder blend doing its job.

WHERE IT DIFFERS FROM THE OLDER AUDIT, which matters for reading that one's
results. `audit_arm_weights.py` locates bones by SUMMING NODE TRANSLATIONS
down the hierarchy and ignoring their rotations. On a rig whose bind is an
A-pose that puts the arm bones nowhere near the arms, so its "reach" column —
how far an influenced vertex sits from the chain's own bones — is measured
against the wrong points and comes out at half a body height for every
fighter and both arms. It is not that the test found no signature; it is that
the instrument could not have shown one. This tool composes full TRS matrices,
so the positions it measures against are the positions the bones are at.

It is a diagnostic. No dependencies, no Blender: it parses the .glb directly.
"""

import argparse
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "render3d" / "assets"

CHAINS = {
    "left": ("LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"),
    "right": ("RightShoulder", "RightArm", "RightForeArm", "RightHand"),
}
# The joint actually turned for the test — the shoulder is left alone so the
# rotation is the arm's own, exactly as the doc's Blender recipe describes.
PIVOT = {"left": "LeftArm", "right": "RightArm"}

TURN_DEG = 60.0
MOVE_FRAC = 0.02        # a vertex has "moved" past this much of model height
WEIGHT_EPS = 0.02       # influences below this are numerical dust

CTYPE = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
         5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# The six the guard review flagged, so the table can be read against the report
# it is meant to explain (docs/blender-requests.md).
FLAGGED = {"panda", "todo", "jogo", "sukuna", "gakuganji", "yuki"}


# --------------------------------------------------------------- glTF reading

def read_glb(path):
    data = path.read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError(f"{path.name} is not a .glb")
    off, gltf, blob = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif ctype == 0x004E4942:
            blob = chunk
        off += 8 + clen + (-clen % 4)
    return gltf, blob


def accessor(gltf, blob, index):
    acc = gltf["accessors"][index]
    n = NCOMP[acc["type"]]
    fmt, size = CTYPE[acc["componentType"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or n * size
    unpack = struct.Struct("<" + fmt * n).unpack_from
    return [unpack(blob, base + i * stride) for i in range(acc["count"])]


# ------------------------------------------------------------ 4x4, row-major
#
# Small enough to spell out. Matrices are flat 16-tuples in ROW-major order;
# glTF stores its own column-major, and `mat_from_gltf` is the one place that
# conversion happens.

IDENT = (1.0, 0, 0, 0,  0, 1.0, 0, 0,  0, 0, 1.0, 0,  0, 0, 0, 1.0)


def mat_mul(a, b):
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = (a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c]
                              + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c])
    return tuple(out)


def mat_point(m, p):
    x, y, z = p[0], p[1], p[2]
    return (m[0] * x + m[1] * y + m[2] * z + m[3],
            m[4] * x + m[5] * y + m[6] * z + m[7],
            m[8] * x + m[9] * y + m[10] * z + m[11])


def mat_from_gltf(col):
    """glTF's column-major 16 floats -> our row-major tuple."""
    return tuple(col[c * 4 + r] for r in range(4) for c in range(4))


def trs(node):
    if "matrix" in node:
        return mat_from_gltf(node["matrix"])
    t = node.get("translation") or (0.0, 0.0, 0.0)
    q = node.get("rotation") or (0.0, 0.0, 0.0, 1.0)
    s = node.get("scale") or (1.0, 1.0, 1.0)
    x, y, z, w = q
    rot = (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
           2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
           2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y))
    return (rot[0] * s[0], rot[1] * s[1], rot[2] * s[2], t[0],
            rot[3] * s[0], rot[4] * s[1], rot[5] * s[2], t[1],
            rot[6] * s[0], rot[7] * s[1], rot[8] * s[2], t[2],
            0.0, 0.0, 0.0, 1.0)


def axis_rotation(axis, rad):
    x, y, z = axis
    n = math.sqrt(x * x + y * y + z * z) or 1.0
    x, y, z = x / n, y / n, z / n
    c, s, t = math.cos(rad), math.sin(rad), 1 - math.cos(rad)
    return (t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0.0,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0.0,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0.0,
            0.0, 0.0, 0.0, 1.0)


def globals_of(gltf, extra=None):
    """Every node's world matrix. `extra` maps a node index to a LOCAL matrix
    composed after its own — the pose this test applies."""
    nodes = gltf.get("nodes", [])
    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get("children", []):
            parent[c] = i
    order, seen = [], set()

    def visit(i):
        if i in seen:
            return
        seen.add(i)
        p = parent.get(i)
        if p is not None:
            visit(p)
        order.append(i)

    for i in range(len(nodes)):
        visit(i)
    out = {}
    for i in order:
        local = trs(nodes[i])
        if extra and i in extra:
            local = mat_mul(local, extra[i])
        p = parent.get(i)
        out[i] = mat_mul(out[p], local) if p is not None else local
    return out


# ------------------------------------------------------------------- the test

def measure(char, verbose=False):
    path = ASSETS / char / f"{char}.glb"
    if not path.exists():
        return None
    gltf, blob = read_glb(path)
    if not gltf.get("skins"):
        return None
    nodes = gltf.get("nodes", [])
    name_of = [nd.get("name", "") for nd in nodes]
    skin = gltf["skins"][0]
    joints = skin["joints"]
    ibm = ([mat_from_gltf(m) for m in
            (accessor(gltf, blob, skin["inverseBindMatrices"]))]
           if "inverseBindMatrices" in skin else [IDENT] * len(joints))
    # accessor() hands MAT4 back as one 16-tuple per element, so the list
    # comprehension above already has what it needs.
    rest = globals_of(gltf)

    # Model height, from the skinned meshes' own bind positions.
    prims = []
    lo = hi = None
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            at = prim.get("attributes", {})
            if "JOINTS_0" not in at or "WEIGHTS_0" not in at:
                continue
            pos = accessor(gltf, blob, at["POSITION"])
            prims.append((pos, accessor(gltf, blob, at["JOINTS_0"]),
                          accessor(gltf, blob, at["WEIGHTS_0"])))
            for p in pos:
                lo = p[1] if lo is None else min(lo, p[1])
                hi = p[1] if hi is None else max(hi, p[1])
    if not prims or lo is None or hi <= lo:
        return None
    height = hi - lo

    out = {}
    for side, chain in CHAINS.items():
        pivot_name = PIVOT[side]
        pivot = next((j for j, n in enumerate(joints)
                      if name_of[joints[j]] == pivot_name), None)
        if pivot is None:
            out[side] = None
            continue
        chain_joints = {j for j in range(len(joints))
                        if name_of[joints[j]] in chain}
        # Descendants of the turned bone move too and are still the arm — the
        # hand and any fingers under it.
        node_parent = {}
        for i, nd in enumerate(nodes):
            for c in nd.get("children", []):
                node_parent[c] = i

        def under_pivot(node_i):
            k, guard = node_i, 0
            while k is not None and guard < 64:
                if name_of[k] == pivot_name:
                    return True
                k, guard = node_parent.get(k), guard + 1
            return False

        arm_joints = {j for j in range(len(joints))
                      if j in chain_joints or under_pivot(joints[j])}

        # Turn the arm about the axis across the body — the one that lifts it.
        posed = globals_of(gltf, {joints[pivot]:
                                  axis_rotation((1, 0, 0), math.radians(TURN_DEG))})
        skin_rest = {j: mat_mul(rest[joints[j]], ibm[j]) for j in range(len(joints))}
        skin_posed = {j: mat_mul(posed[joints[j]], ibm[j]) for j in range(len(joints))}

        influenced = 0
        dragged = 0
        worst = 0.0
        owners = Counter()
        for pos, js, ws in prims:
            for v in range(len(pos)):
                jj, ww = js[v], ws[v]
                total = sum(ww) or 1.0
                on_arm = sum(w for j, w in zip(jj, ww)
                             if w > WEIGHT_EPS and j in arm_joints)
                if on_arm <= WEIGHT_EPS:
                    continue
                influenced += 1
                # Which bone this vertex actually belongs to.
                best_j, best_w = None, 0.0
                for j, w in zip(jj, ww):
                    if w > best_w:
                        best_j, best_w = j, w
                if best_j in arm_joints:
                    continue          # it IS arm skin; moving is its job
                p = pos[v]
                a = b = (0.0, 0.0, 0.0)
                for j, w in zip(jj, ww):
                    if w <= WEIGHT_EPS:
                        continue
                    k = w / total
                    qa = mat_point(skin_rest[j], p)
                    qb = mat_point(skin_posed[j], p)
                    a = (a[0] + k * qa[0], a[1] + k * qa[1], a[2] + k * qa[2])
                    b = (b[0] + k * qb[0], b[1] + k * qb[1], b[2] + k * qb[2])
                d = math.dist(a, b) / height
                if d > MOVE_FRAC:
                    dragged += 1
                    worst = max(worst, d)
                    owners[name_of[joints[best_j]]] += 1
        out[side] = {"influenced": influenced, "dragged": dragged,
                     "frac": dragged / influenced if influenced else 0.0,
                     "worst": worst, "owners": owners}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--verbose", action="store_true",
                    help="list which bones the dragged vertices belong to")
    args = ap.parse_args()

    chars = args.chars or sorted(p.name for p in ASSETS.iterdir()
                                 if p.is_dir() and (p / f"{p.name}.glb").exists())
    rows = []
    for char in chars:
        try:
            r = measure(char, args.verbose)
        except Exception as err:
            print(f"{char:12} unreadable: {err}", file=sys.stderr)
            continue
        if not r or not r["left"] or not r["right"]:
            continue
        rows.append((char, r["left"], r["right"]))

    print(f"turning each arm {TURN_DEG:g}deg alone; a vertex counts as dragged when it "
          f"moves >{MOVE_FRAC:.0%} of height and belongs to a bone outside the arm\n")
    print(f"{'char':12} {'L drag':>7} {'L frac':>7} {'L worst':>8}   "
          f"{'R drag':>7} {'R frac':>7} {'R worst':>8}   flag")
    for char, L, R in sorted(rows, key=lambda x: -x[1]["frac"]):
        print(f"{char:12} {L['dragged']:7} {L['frac']:7.1%} {L['worst']:8.3f}   "
              f"{R['dragged']:7} {R['frac']:7.1%} {R['worst']:8.3f}   "
              f"{'<-- flagged' if char in FLAGGED else ''}")
        if args.verbose:
            for side, r in (("L", L), ("R", R)):
                if r["owners"]:
                    top = ", ".join(f"{n} {c}" for n, c in r["owners"].most_common(6))
                    print(f"             {side} owners: {top}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
