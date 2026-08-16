#!/usr/bin/env python3
"""Take the OTHER arm's skin off this arm's bones.

    python3 tools/prune_arm_weights.py                 # what it would do, roster-wide
    python3 tools/prune_arm_weights.py jogo            # one fighter
    python3 tools/prune_arm_weights.py --apply jogo    # write the .glb

WHAT IT FIXES, and only that. `tools/audit_arm_drag.py` turns each arm alone
and lists which bones the geometry that came along actually belongs to. Nearly
every rig drags a little Spine and Spine1 — that is a shoulder blending into
the ribs, and it is what a shoulder is for. Four rigs drag something a body
never does: the OTHER ARM.

    jogo    313 vertices   LeftArm tows RightArm's skin, and the reverse
    mahito  503
    todo     49
    reggie   35

Nobody else on the roster has a single one. A vertex that belongs to one arm
cannot legitimately be driven by the other: there is no pose in which those two
pieces of skin travel together, so when the far arm lifts across the body in
the guard it takes the near arm's sleeve with it. That is the "pulling body
geometry along with it" of the guard review, and it is a mis-ASSIGNMENT — a
weight on a bone nowhere near the vertex — rather than a bad distribution of
weight between bones that do own it.

THE RULE, stated so it can be argued with. An influence is pruned when

  * the bone is in one arm chain — Arm / ForeArm / Hand, and anything under
    the hand;
  * the vertex's own DOMINANT bone is in the OPPOSITE arm chain;
  * and the influence is at least 5% of the vertex.

Everything else is left alone. In particular:

  THE CLAVICLES ARE NOT IN THE CHAIN, and that exclusion is the whole
  difference between a tool that names four rigs and one that names all
  twenty-eight. `LeftShoulder` and `RightShoulder` meet at the sternum, so
  vertices at the base of the neck legitimately share weight between them —
  every rig here has a few hundred, all within a couple of centimetres of
  x = 0, and pruning them would tear the collar off the roster.

  SPINE INFLUENCES ARE LEFT ALONE, however large. Whether a shoulder blend
  reaches too far into the ribs is a judgement about a body, and this is not
  the tool for it.

The remaining weights are renormalised so the vertex still sums to one, which
is the whole of the repair: the geometry stops being towed and nothing else
about it changes.

WHAT THIS IS NOT. It is not a re-bind. Two of the six fighters the guard review
flagged — gakuganji and sukuna — drag almost nothing by either test, so
whatever is wrong with their far arm is in how weight is SHARED between the
bones that legitimately own each vertex, and no prune can invent weights that
were never there. That case still wants Blender; see docs/blender-requests.md.

No dependencies and no Blender: it rewrites the WEIGHTS_0 buffer in place.
"""

import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_arm_drag import (            # noqa: E402  — same buffers, same reader
    ASSETS, accessor, read_glb,
)

# Deliberately NOT the CHAINS of audit_arm_drag: no clavicles. See the rule
# above — the shoulders meet in the middle and share weight there honestly.
LIMBS = {
    "left": ("LeftArm", "LeftForeArm", "LeftHand"),
    "right": ("RightArm", "RightForeArm", "RightHand"),
}
CROSS_MIN = 0.05


def write_glb(path, gltf, blob):
    text = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    body = bytes(blob) + b"\0" * (-len(blob) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2,
                             12 + 8 + len(text) + 8 + len(body)))
        fh.write(struct.pack("<II", len(text), 0x4E4F534A))
        fh.write(text)
        fh.write(struct.pack("<II", len(body), 0x004E4942))
        fh.write(body)


def limb_of(name):
    for side, bones in LIMBS.items():
        if name in bones:
            return side
    return None


def prune(char, apply_it=False):
    path = ASSETS / char / f"{char}.glb"
    if not path.exists():
        return None
    gltf, blob = read_glb(path)
    if not gltf.get("skins"):
        return None
    nodes = gltf.get("nodes", [])
    name_of = [nd.get("name", "") for nd in nodes]
    joints = gltf["skins"][0]["joints"]

    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get("children", []):
            parent[c] = i

    def side_of(j):
        """Which arm this joint drives, walking up so a finger under LeftHand
        counts as the left arm. None for everything that is not an arm."""
        k, guard = joints[j], 0
        while k is not None and guard < 64:
            s = limb_of(name_of[k])
            if s:
                return s
            k, guard = parent.get(k), guard + 1
        return None

    sides = [side_of(j) for j in range(len(joints))]

    blob = bytearray(blob)
    cut, touched = 0, 0
    examples = []
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            at = prim.get("attributes", {})
            if "JOINTS_0" not in at or "WEIGHTS_0" not in at:
                continue
            acc = gltf["accessors"][at["WEIGHTS_0"]]
            if acc["componentType"] != 5126:
                raise SystemExit(f"{char}: WEIGHTS_0 is not float — not handled")
            js = accessor(gltf, blob, at["JOINTS_0"])
            ws = accessor(gltf, blob, at["WEIGHTS_0"])
            view = gltf["bufferViews"][acc["bufferView"]]
            base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = view.get("byteStride") or 16
            pack = struct.Struct("<ffff").pack_into

            for v in range(len(ws)):
                jj, w = js[v], list(ws[v])
                best = max(range(len(w)), key=lambda k: w[k])
                owner = sides[jj[best]] if jj[best] < len(sides) else None
                if not owner:
                    continue                  # not this arm's vertex to defend
                changed = False
                for k, (j, x) in enumerate(zip(jj, w)):
                    if k == best or x < CROSS_MIN or j >= len(sides):
                        continue
                    if sides[j] and sides[j] != owner:
                        if len(examples) < 3:
                            examples.append(
                                f"{name_of[joints[jj[best]]]} {w[best]:.2f}"
                                f" <- {name_of[joints[j]]} {x:.2f}")
                        w[k] = 0.0
                        changed = True
                        cut += 1
                if not changed:
                    continue
                total = sum(w)
                if total <= 1e-6:
                    continue                  # pruning it all would unbind it
                pack(blob, base + v * stride, *[x / total for x in w])
                touched += 1

    if apply_it and touched:
        write_glb(path, gltf, bytes(blob))
    return {"cut": cut, "touched": touched, "examples": examples}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    chars = args.chars or sorted(p.name for p in ASSETS.iterdir()
                                 if p.is_dir() and (p / f"{p.name}.glb").exists())
    total = 0
    for char in chars:
        try:
            r = prune(char, args.apply)
        except Exception as err:
            print(f"{char:12} unreadable: {err}", file=sys.stderr)
            continue
        if not r or not r["touched"]:
            continue
        total += r["touched"]
        print(f"{char:12} {r['touched']:5} vertices re-weighted, "
              f"{r['cut']} cross-arm influences removed"
              f"{'   WROTE' if args.apply else ''}")
        for e in r["examples"]:
            print(f"             e.g. {e}")
    if not total:
        print("nothing to prune")
    elif not args.apply:
        print("\ndry run — pass --apply to write the .glb files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
