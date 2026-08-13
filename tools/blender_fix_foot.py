"""Replace a malformed foot with a good one — the other foot, mirrored, or the
same foot from another generation of the model.

    <blender> -b -P tools/blender_fix_foot.py -- \
        --in  render3d/assets/momo/momo.glb --out out.glb --from Right --to Left

    <blender> -b -P tools/blender_fix_foot.py -- \
        --in ... --out ... --to Left --to Right --donor render3d/assets/meimei/meimei_alt.glb

WHY THIS IS POSSIBLE AT ALL, and it is not because the meshes are tidy: a
generated body is a PATCHWORK of disconnected shells — 198 on Mei Mei, 340 on
her older self, 272 on Momo — that overlap and abut rather than sharing edges.
There is no continuous surface to cut, and equally nothing to tear: visual
continuity comes from shells sitting inside one another. So the unit of surgery
is a SHELL, and swapping one for another that occupies the same space at the
ankle is a local edit with no seam to stitch. A foot lives in about two shells
of 250-600 verts, each of which carries some shin along with it — which is
convenient rather than awkward, since shins are the symmetric part.

THE MIRROR PLANE IS READ OFF THE SKELETON, never assumed to be x=0. These rigs
carry a yaw offset (the fighter's forward is not the file's +Z), and half of
them sit off-centre. The plane is the perpendicular bisector of the two ANKLE
BONES, which is the fighter's own sagittal plane however the file is oriented —
get this from the world axes instead and the mirrored foot lands beside the leg
rather than under it.

WEIGHTS ARE REMAPPED BY NAME, not rebound. The donor shell is bound to
RightFoot/RightToeBase/RightLeg; the same geometry on the other side must
follow LeftFoot/LeftToeBase/LeftLeg. Since the two bones are mirror images of
each other in the rest pose, reflecting the geometry and renaming the groups
puts the foot in the right place AND makes it deform correctly — no reskinning,
no heat-map guessing, nothing that can quietly go wrong in a pose nobody looked
at.

A reflection reverses winding, so the copied faces are flipped back or the foot
renders inside-out — visible only under the toon pass's back-face rules, which
is exactly the kind of thing that ships.
"""

import argparse
import os
import sys
from collections import defaultdict

import bmesh
import bpy
from mathutils import Vector

SIDES = ("Left", "Right")


def bone_named(arm, name):
    return arm.data.bones.get(name) or arm.data.bones.get("mixamorig:" + name)


def foot_groups(side):
    """The bones whose geometry IS the foot. The shin comes along inside the
    shell, but it is not what decides which shell to take."""
    return {side + "Foot", side + "ToeBase"}


def dominant(obj):
    """vertex index -> the bone holding most of its weight."""
    gi = {g.index: g.name.split(":")[-1] for g in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            out[v.index] = gi.get(g.group, "")
    return out


def islands(obj):
    """Connected components of the mesh, as {root: [vertex indices]}."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    par = list(range(len(bm.verts)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    for e in bm.edges:
        a, b = find(e.verts[0].index), find(e.verts[1].index)
        if a != b:
            par[a] = b
    out = defaultdict(list)
    for v in bm.verts:
        out[find(v.index)].append(v.index)
    bm.free()
    return out


def shells_for(obj, side, dom=None, isl=None, foot_only=False):
    """The shells that carry this side's foot, and the verts in them.

    `foot_only` narrows each shell to the vertices the foot bones actually
    own. A shell is 40-50% foot at best — the rest is shin — so taking whole
    shells across MODELS drags one generation's calf into another's leg, which
    is what turned Maki's boots into a knot. Within one model that does not
    arise: the mirror's donor shin is this same body's other shin."""
    dom = dom if dom is not None else dominant(obj)
    isl = isl if isl is not None else islands(obj)
    want = foot_groups(side)
    keep = []
    for verts in isl.values():
        hit = [i for i in verts if dom.get(i) in want]
        if hit:
            keep.append(hit if foot_only else verts)
    return keep


def mirror_plane(arm):
    """Point and unit normal of the fighter's own sagittal plane."""
    l = bone_named(arm, "LeftFoot")
    r = bone_named(arm, "RightFoot")
    if not l or not r:
        sys.exit("no LeftFoot/RightFoot in the rig — cannot find the fighter's midline")
    lp = arm.matrix_world @ l.head_local
    rp = arm.matrix_world @ r.head_local
    axis = (lp - rp)
    if axis.length < 1e-6:
        sys.exit("the two ankles sit on top of each other — no midline to mirror about")
    return (lp + rp) / 2.0, axis.normalized()


def reflect(p, origin, normal):
    return p - normal * (2.0 * (p - origin).dot(normal))


def weights_of(obj):
    """[(vertex index, [(group name, weight), ...]), ...] with bare bone names."""
    gi = {g.index: g.name.split(":")[-1] for g in obj.vertex_groups}
    return [(v.index, [(gi.get(g.group, ""), g.weight) for g in v.groups])
            for v in obj.data.vertices]


def rebind(obj, table, remap):
    """Clear this object's groups and re-add them under remapped names."""
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {}
    for idx, pairs in table:
        for name, w in pairs:
            name = remap(name)
            if not name:
                continue
            g = groups.get(name)
            if g is None:
                g = groups[name] = obj.vertex_groups.new(name=name)
            g.add([idx], w, "REPLACE")


def delete_verts(obj, doomed):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in sorted(doomed)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def keep_only(obj, keep):
    doomed = set(range(len(obj.data.vertices))) - set(keep)
    delete_verts(obj, doomed)


def body_meshes(arm):
    return [o for o in bpy.data.objects
            if o.type == "MESH" and o.vertex_groups and o.parent_type != "BONE"]


def graft(target_obj, donor_obj, src_side, dst_side, arm, report, mirrored,
          donor_arm=None, foot_only=False):
    """Put donor's `src_side` foot shells onto target as its `dst_side` foot."""
    donor_shells = shells_for(donor_obj, src_side, foot_only=foot_only)
    if not donor_shells:
        report.append(f"  no {src_side} foot found on the donor — nothing to take")
        return False
    donor_verts = [i for s in donor_shells for i in s]

    copy = donor_obj.copy()
    copy.data = donor_obj.data.copy()
    bpy.context.scene.collection.objects.link(copy)
    keep_only(copy, donor_verts)

    if donor_arm and donor_arm is not arm:
        # ANOTHER MODEL'S FOOT LANDS IN THIS MODEL'S ANKLE. Two generations of
        # the same fighter are both conformed to the same canon height with
        # their feet on the floor, but that does not put their ankles in the
        # same place — legs differ by a few centimetres and the whole body may
        # be turned. Carrying the foot through the ankle BONE's frame (out of
        # the donor's, into the target's) puts it where this rig's ankle
        # actually is, pointing the way this rig's foot actually points.
        dj = bone_named(donor_arm, src_side + "Foot")
        tj = bone_named(arm, dst_side + "Foot")
        if not dj or not tj:
            report.append(f"  no {src_side}Foot on one of the rigs — cannot place the graft")
            bpy.data.objects.remove(copy, do_unlink=True)
            return False
        into = (arm.matrix_world @ tj.matrix_local) \
            @ (donor_arm.matrix_world @ dj.matrix_local).inverted()
        mw = copy.matrix_world
        inv = mw.inverted()
        for v in copy.data.vertices:
            v.co = inv @ (into @ (mw @ v.co))

    if mirrored:
        origin, normal = mirror_plane(arm)
        mw = copy.matrix_world
        inv = mw.inverted()
        for v in copy.data.vertices:
            v.co = inv @ reflect(mw @ v.co, origin, normal)
        # A reflection reverses winding; flip it back or the foot is inside-out.
        bm = bmesh.new()
        bm.from_mesh(copy.data)
        for f in bm.faces:
            f.normal_flip()
        bm.to_mesh(copy.data)
        bm.free()

    table = weights_of(copy)
    if mirrored:
        def remap(name):
            if name.startswith(src_side):
                return dst_side + name[len(src_side):]
            if name.startswith(dst_side):
                return src_side + name[len(dst_side):]
            return name
    else:
        def remap(name):
            return name
    rebind(copy, table, remap)

    # Out with the bad one. Done AFTER the donor is prepared, so a failure
    # above leaves the model as it was rather than footless.
    old_shells = shells_for(target_obj, dst_side, foot_only=foot_only)
    doomed = [i for s in old_shells for i in s]
    old_sole = min((target_obj.matrix_world @ target_obj.data.vertices[i].co).z
                   for i in doomed) if doomed else None

    # THE FIGHTER HAS TO STAND ON THE FLOOR. Matching ankle to ankle is the
    # right way to ORIENT a borrowed foot and the wrong way to place it: a
    # donor with a thicker sole hangs that much lower, and since the two
    # ankles sit at different heights the two feet sink by different amounts.
    # Maki's grafted feet ended 8.6 cm and 1.6 cm under the floor — one leg
    # buried, and the pair 6.9 cm out of level with each other, which reads as
    # a limp before anyone thinks to look at the boots. So the sole is landed
    # where the sole it replaces was, and the centimetre or two of slack goes
    # into the ankle, inside the boot, where nothing can see it.
    if old_sole is not None and copy.data.vertices:
        new_sole = min((copy.matrix_world @ v.co).z for v in copy.data.vertices)
        drop = old_sole - new_sole
        if abs(drop) > 1e-5:
            inv = copy.matrix_world.inverted()
            base = copy.matrix_world
            for v in copy.data.vertices:
                w = base @ v.co
                w.z += drop
                v.co = inv @ w
            report.append(f"  {dst_side} sole landed on the floor ({drop * 100:+.1f} cm)")

    delete_verts(target_obj, doomed)

    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    target_obj.select_set(True)
    bpy.context.view_layer.objects.active = target_obj
    bpy.ops.object.join()
    report.append(f"  {dst_side} foot <- {src_side} "
                  f"{'mirrored' if mirrored else 'grafted'}: "
                  f"{len(donor_verts)} vert(s) in {len(donor_shells)} shell(s) in, "
                  f"{len(doomed)} out")
    return True


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_fix_foot")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--to", dest="to", action="append", required=True,
                    choices=SIDES, help="the foot to REPLACE; repeatable")
    ap.add_argument("--from", dest="frm", choices=SIDES,
                    help="the foot to copy, mirrored, from the same model")
    ap.add_argument("--donor", help="another .glb of the same fighter to take feet from")
    ap.add_argument("--foot-only", action="store_true",
                    help="take only the foot bones' own verts, leaving each model its own shin")
    args = ap.parse_args(argv)
    if not args.frm and not args.donor:
        sys.exit("say where the good foot comes from: --from <side> or --donor <glb>")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input")
    for ob in bpy.data.objects:
        if ob.type == "ARMATURE":
            ob.data.pose_position = "REST"
    bpy.context.view_layer.update()
    target = max(body_meshes(arm), key=lambda o: len(o.data.vertices))

    report = [f"fixing feet on {os.path.basename(args.src)}:"]

    donor_obj = target
    donor_arm = arm
    if args.donor:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=args.donor)
        new = [o for o in bpy.data.objects if o not in before]
        donor_arm = next((o for o in new if o.type == "ARMATURE"), None)
        if donor_arm:
            donor_arm.data.pose_position = "REST"
        bpy.context.view_layer.update()
        cands = [o for o in new if o.type == "MESH" and o.vertex_groups
                 and o.parent_type != "BONE"]
        if not cands:
            sys.exit("the donor has no skinned mesh")
        donor_obj = max(cands, key=lambda o: len(o.data.vertices))
        report.append(f"  donor: {os.path.basename(args.donor)}")

    for side in args.to:
        src_side = args.frm or side
        graft(target, donor_obj, src_side, side, arm, report,
              mirrored=bool(args.frm) and src_side != side,
              donor_arm=donor_arm, foot_only=args.foot_only)

    # Only the fighter ships: the export selects this armature and its own
    # children, so whatever the donor dragged in is simply never written.
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.dst, use_selection=True,
                              export_format="GLB", export_animations=True,
                              export_animation_mode="ACTIONS", export_yup=True)
    print("\n".join(report))
    print(f"wrote {args.dst}")


if __name__ == "__main__":
    main()
