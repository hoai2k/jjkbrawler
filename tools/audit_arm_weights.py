#!/usr/bin/env python3
"""Is each arm's SKIN as good as the other arm's?

    python3 tools/audit_arm_weights.py [char ...]

WHY. Five fighters came back from the guard review with the same complaint —
the far (left) arm reads long, bent, huge, or drags body geometry with it. The
skeleton is not the culprit: measured in the guard pose, every one of those
rigs has arm bones that are exactly symmetric and unscaled. So the bones move
correctly and the MESH does not follow, which is a binding problem.

The suspicion to test is specific: the rigs went through a SYMMETRIZE pass, and
a symmetrize that copies bones without re-binding leaves one side's weights
describing the other side's geometry. That has a signature you can see without
opening Blender — the two arms stop being mirror images of each other.

WHAT IS MEASURED, per arm chain (Arm / ForeArm / Hand):

  vertices   how many the chain influences at all. Two arms on one body should
             claim roughly the same number; a chain claiming half again as many
             as its mirror is claiming something that is not an arm.
  reach      the furthest an influenced vertex sits from the chain's own bones,
             as a fraction of the model's height. An arm's skin lies along the
             arm, so this is small. Torso vertices bound to a forearm make it
             large, and that is exactly "pulling body geometry along with it".
  spread     the bounding box of the influenced vertices, same units. A limb is
             a thin thing; a box the size of a chest is not a limb.

No dependencies, no Blender: this reads the glTF buffers straight out of the
.glb. It diagnoses only — the fix is a re-bind, which needs Blender
(tools/blender_clean_weights.py) and is written up in docs/blender-requests.md.
"""

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "render3d" / "assets"

CHAINS = {
    "left": ["LeftArm", "LeftForeArm", "LeftHand"],
    "right": ["RightArm", "RightForeArm", "RightHand"],
}

# glTF component types -> (struct char, byte size)
CTYPE = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
         5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


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
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return gltf, blob


def accessor(gltf, blob, index):
    """One accessor, as a list of tuples (or scalars for SCALAR)."""
    acc = gltf["accessors"][index]
    n = NCOMP[acc["type"]]
    fmt, size = CTYPE[acc["componentType"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or n * size
    out = []
    for i in range(acc["count"]):
        vals = struct.unpack_from("<" + fmt * n, blob, base + i * stride)
        out.append(vals if n > 1 else vals[0])
    return out


def node_world(gltf, index, cache):
    """A node's world translation, walking parents. Rigs here are authored
    without per-node scale on the skeleton, so translation is enough to say
    where a bone sits."""
    if index in cache:
        return cache[index]
    parents = {}
    for i, nd in enumerate(gltf.get("nodes", [])):
        for c in nd.get("children", []):
            parents[c] = i
    pos = [0.0, 0.0, 0.0]
    i = index
    seen = set()
    while i is not None and i not in seen:
        seen.add(i)
        t = gltf["nodes"][i].get("translation") or [0, 0, 0]
        pos = [pos[0] + t[0], pos[1] + t[1], pos[2] + t[2]]
        i = parents.get(i)
    cache[index] = pos
    return pos


def audit(char):
    path = ASSETS / char / f"{char}.glb"
    if not path.exists():
        return None
    gltf, blob = read_glb(path)
    nodes = gltf.get("nodes", [])
    name_of = {i: nd.get("name", "") for i, nd in enumerate(nodes)}
    cache = {}

    # Every skinned primitive, gathered per bone NAME so a rig split across
    # several meshes is still one answer.
    per_bone = {}          # bone name -> list of vertex positions
    ys = []
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            at = prim.get("attributes", {})
            if "JOINTS_0" not in at or "WEIGHTS_0" not in at:
                continue
            joints = accessor(gltf, blob, at["JOINTS_0"])
            weights = accessor(gltf, blob, at["WEIGHTS_0"])
            pos = accessor(gltf, blob, at["POSITION"])
            skin = gltf["skins"][0] if gltf.get("skins") else None
            if not skin:
                continue
            jmap = skin["joints"]
            for v, (js, ws) in enumerate(zip(joints, weights)):
                ys.append(pos[v][1])
                for j, w in zip(js, ws):
                    if w <= 0.05:
                        continue
                    nm = name_of.get(jmap[j], "")
                    per_bone.setdefault(nm, []).append(pos[v])
    if not ys:
        return None
    height = max(ys) - min(ys)
    if height <= 0:
        return None

    out = {}
    for side, chain in CHAINS.items():
        verts = []
        for b in chain:
            verts.extend(per_bone.get(b, []))
        if not verts:
            out[side] = None
            continue
        bones = [node_world(gltf, i, cache) for i, nm in name_of.items() if nm in chain]
        far = 0.0
        for p in verts:
            d = min((sum((p[k] - b[k]) ** 2 for k in range(3))) ** 0.5 for b in bones) if bones else 0
            far = max(far, d)
        xs = [p[0] for p in verts]; yy = [p[1] for p in verts]; zs = [p[2] for p in verts]
        diag = ((max(xs) - min(xs)) ** 2 + (max(yy) - min(yy)) ** 2 + (max(zs) - min(zs)) ** 2) ** 0.5
        out[side] = {"n": len(verts), "reach": far / height, "spread": diag / height}
    return out


FLAGGED = {"panda", "todo", "jogo", "sukuna", "gakuganji", "yuki"}

chars = sys.argv[1:] or sorted(p.name for p in ASSETS.iterdir()
                               if p.is_dir() and (p / f"{p.name}.glb").exists())
print(f"{'char':12} {'L verts':>8} {'R verts':>8} {'L/R':>6}   "
      f"{'L reach':>8} {'R reach':>8}   {'L spread':>9} {'R spread':>9}   flag")
rows = []
for char in chars:
    try:
        r = audit(char)
    except Exception as err:                       # a rig this cannot read is
        print(f"{char:12} unreadable: {err}")      # information, not a crash
        continue
    if not r or not r["left"] or not r["right"]:
        continue
    L, R = r["left"], r["right"]
    ratio = L["n"] / R["n"] if R["n"] else float("inf")
    rows.append((char, L, R, ratio))

for char, L, R, ratio in sorted(rows, key=lambda x: -x[3]):
    print(f"{char:12} {L['n']:8} {R['n']:8} {ratio:6.2f}   "
          f"{L['reach']:8.3f} {R['reach']:8.3f}   {L['spread']:9.3f} {R['spread']:9.3f}   "
          f"{'<-- flagged' if char in FLAGGED else ''}")
