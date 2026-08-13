#!/usr/bin/env python3
"""Turn a weapon end-for-end in a delivered .glb.

    python3 tools/flip_prop.py --char maki               # what it would do
    python3 tools/flip_prop.py --char maki --apply
    python3 tools/flip_prop.py --char maki --apply --axis z

WHY A FLIP IS EVER NEEDED. A separately generated weapon is joined to the body
by `tools/blender_attach_prop.py`, which places it from the two numbers in
`render3d/src/props.js`: how long the thing is, and where along it the hand
sits — `grip`, measured FROM THE HEAVY END, "because which end is heavy is
measurable and which end is the top is not". That is true and it is also the
gap: nothing in the contract says which end points AWAY from the hand, so the
attach can seat a naginata perfectly and hand it over blade-down. Maki shipped
that way, with the blade at her feet and the butt of the shaft past her head.

WHAT THIS IS. The stopgap, not the fix. The fix is a tip direction in the prop
spec and a re-attach, which needs Blender; this needs nothing, and it corrects
the fighter who is wrong today. It rewrites ONE node's rotation and touches
no geometry, no skin and no texture.

WHY IT PIVOTS WHERE IT DOES. The rotation is composed into the prop node's own
rotation, so it turns the mesh about the mesh's origin — which sits at the
middle of the shaft. The hand therefore keeps its position in space and
changes where along the shaft it grips, by twice the distance the grip sits
from the middle: `grip` 0.45 becomes 0.55. On a 1.8 m polearm that is 9 cm
along a shaft the hand can hold anywhere, which is why this is worth doing
without re-attaching.

THE AXIS MATTERS. Any axis perpendicular to the shaft turns the weapon
end-for-end; which one you pick also decides which way the blade's edge ends
up facing, because the two differ by a half-turn about the shaft. `--axis x`
is the default and `--axis z` is the other one. Look at both.
"""
import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "render3d/assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise SystemExit(f"{path}: not a glTF 2.0 binary")
    doc, blob, at = None, b"", 12
    while at + 8 <= len(data):
        length, kind = struct.unpack_from("<II", data, at)
        chunk = data[at + 8:at + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            blob = chunk
        at += 8 + length + (-length % 4)
    return doc, blob


def write_glb(path, doc, blob):
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    body = bytes(blob) + b"\0" * (-len(blob) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body)))
        fh.write(struct.pack("<II", len(text), 0x4E4F534A))
        fh.write(text)
        fh.write(struct.pack("<II", len(body), 0x004E4942))
        fh.write(body)


def qmul(a, b):
    """Hamilton product, glTF's (x, y, z, w) order. `a * b` rotates by b first."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def prop_nodes(doc):
    """Nodes that carry prop geometry: a mesh, hung under a Prop_* bone."""
    parent = {}
    for i, n in enumerate(doc["nodes"]):
        for c in n.get("children", []):
            parent[c] = i
    out = []
    for i, n in enumerate(doc["nodes"]):
        if "mesh" not in n:
            continue
        k, chain = i, []
        while k is not None:
            chain.append(doc["nodes"][k].get("name", ""))
            k = parent.get(k)
        if any(c.startswith("Prop_") for c in chain[1:]) or \
                (n.get("name", "").startswith("Prop_")):
            out.append((i, chain))
    return out


def long_axis(doc, node):
    a = doc["accessors"][doc["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
    ext = [a["max"][i] - a["min"][i] for i in range(3)]
    k = ext.index(max(ext))
    return "xyz"[k], ext, a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--char", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--axis", default="x", choices=["x", "y", "z"],
                    help="which local axis to turn about; must be across the shaft")
    args = ap.parse_args()

    man = json.load(open(MANIFEST, encoding="utf-8"))["characters"]
    entry = man.get(args.char)
    if not entry or not entry.get("model"):
        raise SystemExit(f"{args.char}: no model in the manifest")
    path = os.path.join(ASSETS, entry["model"])
    doc, blob = read_glb(path)

    props = prop_nodes(doc)
    if not props:
        raise SystemExit(f"{args.char}: no prop geometry found under a Prop_ bone")
    for i, chain in props:
        node = doc["nodes"][i]
        axis, ext, acc = long_axis(doc, node)
        print(f"node {i} {node.get('name')!r}: shaft runs along local {axis.upper()} "
              f"({max(ext):.2f} long), hung on {chain[1] if len(chain) > 1 else '?'}")
        if axis == args.axis:
            raise SystemExit(f"--axis {args.axis} is ALONG the shaft — that spins it "
                             f"rather than turning it end for end")
        turn = {"x": [1.0, 0.0, 0.0, 0.0],
                "y": [0.0, 1.0, 0.0, 0.0],
                "z": [0.0, 0.0, 1.0, 0.0]}[args.axis]
        was = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
        # Composed on the RIGHT: the half-turn happens in the mesh's own frame,
        # before whatever the attach already did, so the pivot is the mesh
        # origin rather than the bone.
        now = qmul(was, turn)
        print(f"   rotation {[round(v, 4) for v in was]} -> {[round(v, 4) for v in now]} "
              f"(half turn about local {args.axis.upper()})")
        node["rotation"] = now

    if not args.apply:
        print("dry run — pass --apply to write the .glb")
        return 0
    write_glb(path, doc, blob)
    read_glb(path)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
