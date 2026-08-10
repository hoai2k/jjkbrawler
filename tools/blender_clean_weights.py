"""Prune anatomically impossible skin weights from a delivered rig.

    blender --background --python tools/blender_clean_weights.py -- \
        --in  billboards/assets/yuji/yuji.glb \
        --out billboards/assets/yuji/yuji.glb

WHY THIS EXISTS. Round B1's fighter lifts his arm and part of his trousers
comes with it: rotating `RightArm` alone moves 230 vertices whose own dominant
bone is `RightUpLeg` — the thigh — by up to 29 cm. No clip can fix that and no
animator authored it. The auto-rigger bound trouser vertices to hand and
forearm bones, and every one of the twenty-eight fighters will arrive with some
version of it, because they all come off the same automatic binder.

WHY PROXIMITY DOES NOT CATCH IT. The obvious rule — drop influences from bones
that are far away — fails on exactly this case, which is why the rig has it in
the first place. The delivery binds in an A-pose, so the hands hang beside the
hips: the hand bone is ~5 cm from the trouser vertices it wrongly drives, and
closer to them than the spine legitimately is. Distance in the bind pose cannot
tell "next to" from "part of".

THE RULE. The SKELETON knows. Walk the bone tree and count joints between the
vertex's dominant bone and each of its other influences. Skin is driven by the
joints it wraps: a hip vertex takes the pelvis (1 hop) and the spine (2); an
elbow takes both arm bones (1). Nothing real reaches further. Hand to thigh is
EIGHT hops — through the whole arm, the whole spine and the pelvis — so it is
not a broad influence, it is a mistake. Influences past MAX_HOPS are dropped
and the vertex renormalised.

This is rig-agnostic: it reads the delivered hierarchy, not a hard-coded body
plan, so it works the same on a fighter with a tail, a wheel or a second pair
of arms. The pass reports what it removed, so a delivery where it fires
heavily is a delivery to look at rather than one silently repaired.

It touches vertex groups only. Actions, meshes, materials and the skeleton come
through untouched, so it is safe to run on an already-animated delivery — which
is how B1's fighter was fixed without re-authoring twenty-six clips.
"""

import argparse
import os
import sys
from collections import deque

import bpy

#: How many joints from a vertex's dominant bone an influence may sit and still
#: be believed. 2 covers every real case (pelvis+spine on a hip, both arm bones
#: on an elbow, shoulder+chest on a deltoid); 4 leaves generous margin and is
#: still less than half the 8 hops from a hand to a thigh.
MAX_HOPS = 4


def hop_table(arm):
    """{bone: {bone: joints between}} over the armature's own hierarchy."""
    adj = {b.name: set() for b in arm.data.bones}
    for bone in arm.data.bones:
        if bone.parent:
            adj[bone.name].add(bone.parent.name)
            adj[bone.parent.name].add(bone.name)
    table = {}
    for start in adj:
        dist = {start: 0}
        q = deque([start])
        while q:
            cur = q.popleft()
            for nxt in adj[cur]:
                if nxt not in dist:
                    dist[nxt] = dist[cur] + 1
                    q.append(nxt)
        table[start] = dist
    return table


def clean_object(obj, arm, hops, report):
    """Prune implausible influences on one skinned mesh. Returns (verts, drops)."""
    names = {g.index: g.name for g in obj.vertex_groups}
    groups = obj.vertex_groups
    touched = 0
    drops = 0
    worst = None

    for vert in obj.data.vertices:
        infl = [(g.group, g.weight) for g in vert.groups if g.weight > 0.0]
        if len(infl) < 2:
            continue
        dom_gi = max(infl, key=lambda g: g[1])[0]
        dom = names.get(dom_gi)
        near = hops.get(dom)
        if near is None:
            continue  # a group that is not a bone: leave it alone
        doomed = []
        for gi, w in infl:
            if gi == dom_gi:
                continue
            name = names.get(gi)
            if name is None or name not in near:
                continue
            if near[name] > MAX_HOPS:
                doomed.append((gi, w, name, near[name]))
        if not doomed:
            continue
        touched += 1
        for gi, w, name, d in doomed:
            groups[gi].remove([vert.index])
            drops += 1
            if worst is None or w > worst[0]:
                worst = (w, name, dom, d)

    if touched:
        # Renormalise so the surviving influences still sum to 1 — otherwise a
        # pruned vertex shrinks toward the origin under the skin.
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        report.append(f"  {obj.name}: pruned {drops} influence(s) on {touched} vertex/vertices")
        if worst:
            report.append(f"    worst: '{worst[1]}' at weight {worst[0]:.3f} on skin owned by "
                          f"'{worst[2]}', {worst[3]} joints away")
    else:
        report.append(f"  {obj.name}: nothing implausible")
    return touched, drops


def clean_all(arm, report):
    """Run the pass over every mesh skinned to `arm`. Returns total drops."""
    meshes = [o for o in bpy.context.scene.objects
              if o.type == "MESH" and any(m.type == "ARMATURE" and m.object == arm
                                          for m in o.modifiers)]
    if not meshes:
        meshes = [o for o in arm.children if o.type == "MESH"]
    hops = hop_table(arm)
    report.append(f"skin-weight sanity pass: influences beyond {MAX_HOPS} joints from the "
                  f"vertex's own bone are dropped")
    total = 0
    for obj in meshes:
        total += clean_object(obj, arm, hops, report)[1]
    return total


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_clean_weights")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input — a delivery must be a rigged model")

    report = []
    clean_all(arm, report)

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.dst,
        use_selection=True,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
    )
    print("\n".join(report))
    print(f"wrote {args.dst}")


if __name__ == "__main__":
    main()
