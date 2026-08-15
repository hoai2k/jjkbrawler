#!/usr/bin/env python3
"""Cut a limb free of the body it was generated welded to.

    python3 tools/cut_fused_limb.py                  # what is welded, roster-wide
    python3 tools/cut_fused_limb.py inumaki          # one fighter
    python3 tools/cut_fused_limb.py --apply inumaki  # cut it

WHAT A WELD IS. Tripo reconstructs a body from flat boards. Where an arm rests
against the ribs in the source art it has no way to know the two are separate
things, so it builds ONE surface across the gap — a sheet of skin from the
forearm to the hip, as if the character were webbed.

In the bind it is nearly invisible: the arm is against the body and the sheet
is a few centimetres of fold. It is the ANIMATION that exposes it. Raise the
arm and the sheet stretches with it, because it is weighted to both ends: a
black membrane from wrist to waist that grows every time the fighter runs.
That is why nothing caught it at intake — every check there looks at a model
standing still.

HOW IT IS FOUND. Not by shape, which is the obvious idea and does not work — a
weld is a thin sheet and so is a lapel. By WEIGHTS. These meshes come as a
patchwork of a couple of hundred disconnected shells, and a shell is a
coherent piece of surface, so the question can be asked of a whole shell at
once: does it belong to the arm, or to the trunk? A sleeve scores ~1.0 on the
arm; a hip scores ~1.0 on the trunk. Only a weld scores on BOTH, because only
a weld has vertices at both ends. Inumaki's scores 0.42 arm / 0.51 trunk, and
it is weighted to the FOREARM and the THIGH at once, which nothing on a real
body is.

WHY DELETING A SHELL IS SAFE HERE. The shells overlap rather than share edges,
so removing one does not tear its neighbours — the body underneath is already
a closed surface where it matters, and on Inumaki nothing shows through from
any angle after the cut.

**DO NOT RUN `fill_model_holes.py` AFTERWARDS WITHOUT LOOKING.** It is the
right tool for a tear and the wrong one for this: the rim a weld leaves behind
spans the gap the weld was filling, so capping it rebuilds the membrane. On
Inumaki that is exactly what happened — cut, filled, and the black sheet was
back, 136 triangles of it, this time with the tool's blessing. The rim is
reported as a 0.19m tear and is left open on purpose. If a future weld does
leave something visible, close it per side rather than across.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "render3d/assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")

BLENDER = os.environ.get("BLENDER") or os.path.join(
    os.environ.get("SCRATCH", "/tmp"), "blender/blender")

# The script Blender runs. Kept here rather than in its own file because it is
# meaningless without the explanation above it.
BLENDER_SCRIPT = r'''
import bpy, sys, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_json, dst = argv[0], argv[1], (argv[2] if len(argv) > 2 else "")

# A weld's two ends. The FOREARM and the HAND are the tell rather than the
# upper arm: an upper arm legitimately shares weight with the shoulder and the
# chest, so a shell blending those is a deltoid, not a weld.
ARM = {"LeftForeArm", "LeftHand", "RightForeArm", "RightHand"}
UPPER = {"LeftArm", "RightArm"}
TRUNK = {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg",
         "Hips", "mixamorig:Hips", "Spine", "Spine1", "Spine2"}
# How much of a shell has to belong to each end before it counts as a bridge,
# and how big a shell may be and still be one. The size test is what separates
# a weld from a deltoid: a big shell that spans the arm and the trunk IS the
# arm, blending into the shoulder the way an arm should. A small one spanning
# the same two things is a bridge between them. On Inumaki that is the
# difference between a 580-face sleeve (kept) and three shells of 95, 107 and
# 46 faces (cut) — and cutting only the most obvious one leaves the membrane
# still stretching, because a weld is rarely a single patch.
SHARE = 0.12
MIN_FACES = 20
MAX_FACES = 200

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = max((o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups),
           key=lambda o: len(o.data.vertices))
name0 = body.name

bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]

found, keep = [], []
for o in parts:
    arm_w = trunk_w = upper_w = 0.0
    for v in o.data.vertices:
        for g in v.groups:
            n = o.vertex_groups[g.group].name
            if n in ARM:
                arm_w += g.weight
            elif n in UPPER:
                upper_w += g.weight
            elif n in TRUNK:
                trunk_w += g.weight
    total = arm_w + trunk_w + upper_w
    bridge = (MIN_FACES <= len(o.data.polygons) <= MAX_FACES and total > 0
              and arm_w / total >= SHARE and trunk_w / total >= SHARE)
    if bridge:
        c = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
        tally = {}
        for v in o.data.vertices:
            for g in v.groups:
                if g.weight > 0.25:
                    n = o.vertex_groups[g.group].name
                    tally[n] = tally.get(n, 0.0) + g.weight
        found.append({
            "shell": o.name.split(".")[-1],
            "faces": len(o.data.polygons),
            "arm": round(arm_w / total, 2),
            "trunk": round(trunk_w / total, 2),
            "at": [round(c.x, 3), round(c.y, 3), round(c.z, 3)],
            "bones": [n for n, _ in sorted(tally.items(), key=lambda kv: -kv[1])[:4]],
        })
    else:
        keep.append(o)

json.dump(found, open(out_json, "w"))

if dst and found:
    for o in parts:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in keep:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = name0
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB",
                              export_animations=True, export_skins=True,
                              export_apply=False)
'''


def models(only):
    man = json.load(open(MANIFEST))
    out = []
    for key, entry in (man.get("characters") or {}).items():
        if only and key not in only:
            continue
        if not entry.get("model"):
            continue
        out.append((key, os.path.join(ASSETS, entry["model"])))
    return out


def run(char, path, apply_it):
    with tempfile.TemporaryDirectory() as tmp:
        script = os.path.join(tmp, "cut.py")
        report = os.path.join(tmp, "found.json")
        open(script, "w").write(BLENDER_SCRIPT)
        dst = os.path.join(tmp, "cut.glb") if apply_it else ""
        cmd = [BLENDER, "-b", "--python", script, "--", path, report]
        if dst:
            cmd.append(dst)
        res = subprocess.run(cmd, capture_output=True, text=True)
        if not os.path.exists(report):
            print(f"{char}: blender failed\n{res.stdout[-1500:]}{res.stderr[-800:]}")
            return None
        found = json.load(open(report))
        if apply_it and found and os.path.exists(dst):
            os.replace(dst, path)
        return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    only = set(args.chars)

    if not os.path.exists(BLENDER):
        sys.exit(f"blender not found at {BLENDER} — set $BLENDER")

    print("model        welds  faces  arm/trunk  where            bones")
    total = 0
    for char, path in models(only):
        found = run(char, path, args.apply)
        if found is None:
            continue
        total += len(found)
        if not found:
            print(f"{char:<12} {0:>5}")
            continue
        for i, f in enumerate(found):
            head = char if i == 0 else ""
            print("%-12s %5s %6d  %.2f/%.2f   %-16s %s" % (
                head, len(found) if i == 0 else "", f["faces"], f["arm"], f["trunk"],
                ",".join(str(v) for v in f["at"]), " ".join(f["bones"])))
    print()
    if args.apply:
        print(f"cut {total} weld(s). LOOK AT THE MODEL BEFORE CLOSING ANYTHING:")
        print("    render3d/workbench/?edit=rigs&char=" + (next(iter(only), "<char>")))
        print("  The rim a weld leaves spans the gap the weld was filling, so")
        print("  fill_model_holes.py will rebuild the membrane if you let it.")
    else:
        print(f"found {total} weld(s); dry run — pass --apply to cut them")


if __name__ == "__main__":
    main()
