"""Conform a generated rig into a delivery this repo's intake accepts.

Run headless — no GUI, no interaction, so it works the same on a laptop, in
CI, or in an agent container:

    blender --background --python tools/blender_conform.py -- \
        --in  billboards/intake/yuji/_raw.glb \
        --out billboards/intake/yuji/yuji.glb \
        --char yuji

WHY THIS EXISTS. A 3D generator (Tripo, Meshy, Rodin…) and an animation
library (Mixamo and friends) each have their own bone naming, their own scale
and their own clip timings. Our delivery spec has exactly one of each
(billboards/docs/asset-requests.md), and `tools/billboard_intake.mjs validate`
enforces it. Everything between "the generator gave me a file" and "intake
accepts it" is mechanical, so it is a script rather than a manual pass — and
it is the same script for all 28 fighters, which is the whole point of paying
for it once during round B1.

WHAT IT DOES, in order:

  1. Import the .glb.
  2. Rename bones onto the standard skeleton — strips `mixamorig:` prefixes,
     maps common generator spellings (`upperarm_l`, `LeftUpperArm`, `thigh.L`)
     onto our names. Blender fixes animation data paths as bones are renamed,
     so clips follow their bones.
  3. Scale and orient: the figure ends up in metres at the character's real
     height, Y-up, facing +Z, origin on the floor between the feet.
  4. Retime every action to the duration its state declares in
     billboards/src/states.js — the timing contract combat is tuned around.
     An action whose name is not a state is reported and left alone.
  5. Add any missing prop / chain bones the roster expects for this character
     (billboards/src/props.js), empty, so a rigger has the hook to hang art on
     and the validator stops warning about a missing weapon.
  6. Prune skin weights the skeleton says are impossible — an auto-binder
     routinely gives trouser vertices to a hand bone, which is how round B1's
     fighter came to carry his trousers up with his arm
     (tools/blender_clean_weights.py).
  7. Grade the texture onto the fighter's canon costume colours where the
     roster declares them — a generator gets the hue right and the value
     badly, which is how round B1's fighter arrived in a navy so dark it read
     as black (tools/blender_grade_texture.py). No-op for a fighter with no
     palette entry, and safe to re-run.
  8. Export .glb.

It never invents animation. Retiming stretches what is there; a clip whose
CONTENT is wrong (a strike that peaks in the wrong place) is a review finding
for the billboard workbench, not something a script can fix.
"""

import argparse
import os
import re
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_clean_weights import clean_all  # noqa: E402
from blender_grade_texture import grade_char  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES_JS = os.path.join(REPO, "billboards", "src", "states.js")
PROPS_JS = os.path.join(REPO, "billboards", "src", "props.js")
CHARACTERS_JS = os.path.join(REPO, "src", "characters.js")

FPS = 30

# ------------------------------------------------------------------ the spec
#
# Read from the modules that already own these facts rather than restating
# them — states.js is the single source of the state list and its timings, and
# a copy here would drift the first time a duration is tuned.


def load_states():
    src = open(STATES_JS, encoding="utf8").read()
    body = re.search(r"export const STATES = \{(.*?)\n\};", src, re.S)
    if not body:
        sys.exit("could not parse STATES out of billboards/src/states.js")
    states = {}
    for m in re.finditer(r"^  (\w+):\s*\{([^}]*)\}", body.group(1), re.M):
        name, fields = m.group(1), m.group(2)
        dur = re.search(r"duration:\s*([\d.]+)", fields)
        beat = re.search(r"beat:\s*([\d.]+)", fields)
        loop = "loop: true" in fields
        states[name] = {
            "duration": float(dur.group(1)) if dur else 0.5,
            "beat": float(beat.group(1)) if beat else None,
            "loop": loop,
        }
    return states


def load_expectations(char):
    """Prop and chain bones the roster expects for this fighter."""
    src = open(PROPS_JS, encoding="utf8").read()

    def block(name):
        m = re.search(r"export const %s = \{(.*?)\n\};" % name, src, re.S)
        return m.group(1) if m else ""

    props = []
    entry = re.search(r"^  %s:\s*\[(.*?)\],?$" % re.escape(char), block("CHARACTER_PROPS"), re.S | re.M)
    if entry:
        for p in re.finditer(r"bone:\s*\"(\w+)\"", entry.group(1)):
            props.append(p.group(1))

    chains = []
    entry = re.search(r"^  %s:\s*\[(.*?)\],?$" % re.escape(char), block("CHARACTER_CHAINS"), re.S | re.M)
    if entry:
        for c in re.finditer(r"name:\s*\"(\w+)\".*?from:\s*\"(\w+)\".*?segments:\s*(\d+)", entry.group(1), re.S):
            chains.append((c.group(1), c.group(2), int(c.group(3))))
    return props, chains


def canon_height_m(char):
    """The fighter's real height, from their kit. Falls back to the working
    height the game itself uses for a fighter with no published figure."""
    src = open(CHARACTERS_JS, encoding="utf8").read()
    m = re.search(r"^  %s:\s*\{(.*?)\n  \}," % re.escape(char), src, re.S | re.M)
    if m:
        h = re.search(r"heightCm:\s*([\d.]+)", m.group(1))
        if h:
            return float(h.group(1)) / 100.0
    return 1.90


# --------------------------------------------------------------- bone naming

STANDARD = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
]

# Spellings seen from generators and animation libraries, normalised (lowercase,
# punctuation stripped) -> our name. Mixamo's `mixamorig:` prefix is stripped
# before lookup, which alone resolves most of a Mixamo rig.
ALIASES = {
    "hips": "Hips", "pelvis": "Hips", "root": "Hips",
    "spine": "Spine", "spine01": "Spine", "spine1": "Spine1", "spine02": "Spine1",
    "spine2": "Spine2", "spine03": "Spine2", "chest": "Spine2", "upperchest": "Spine2",
    "neck": "Neck", "head": "Head",
}
for side, ours in (("left", "Left"), ("right", "Right"), ("l", "Left"), ("r", "Right")):
    ALIASES.update({
        f"{side}shoulder": f"{ours}Shoulder", f"clavicle{side}": f"{ours}Shoulder",
        f"shoulder{side}": f"{ours}Shoulder",
        f"{side}arm": f"{ours}Arm", f"{side}upperarm": f"{ours}Arm",
        f"upperarm{side}": f"{ours}Arm", f"{side}armupper": f"{ours}Arm",
        f"{side}forearm": f"{ours}ForeArm", f"lowerarm{side}": f"{ours}ForeArm",
        f"forearm{side}": f"{ours}ForeArm", f"{side}lowerarm": f"{ours}ForeArm",
        f"{side}hand": f"{ours}Hand", f"hand{side}": f"{ours}Hand",
        f"{side}upleg": f"{ours}UpLeg", f"{side}thigh": f"{ours}UpLeg",
        f"thigh{side}": f"{ours}UpLeg", f"{side}upperleg": f"{ours}UpLeg",
        f"{side}leg": f"{ours}Leg", f"calf{side}": f"{ours}Leg",
        f"shin{side}": f"{ours}Leg", f"{side}lowerleg": f"{ours}Leg",
        f"{side}foot": f"{ours}Foot", f"foot{side}": f"{ours}Foot",
        f"{side}toebase": f"{ours}ToeBase", f"ball{side}": f"{ours}ToeBase",
    })


def normalise(name):
    n = re.sub(r"^mixamorig[:_]?", "", name, flags=re.I)
    n = re.sub(r"[^A-Za-z0-9]", "", n).lower()
    return n


def rename_bones(arm_obj, report):
    """Rename onto the standard skeleton. Renaming through `bone.name` lets
    Blender re-path the actions, so clips stay bound to their bones."""
    renamed = 0
    taken = {b.name for b in arm_obj.data.bones}
    for bone in list(arm_obj.data.bones):
        if bone.name in STANDARD:
            continue
        target = ALIASES.get(normalise(bone.name))
        if not target or target in taken:
            continue
        taken.discard(bone.name)
        old = bone.name
        bone.name = target
        taken.add(target)
        renamed += 1
        report.append(f"  bone {old} -> {target}")
    return renamed


# ------------------------------------------------------------------ geometry

def conform_scale_and_orientation(arm_obj, target_h, report):
    """Metres at the fighter's real height, feet on the floor, centred on the
    origin. Height is measured from the whole rendered bounds (mesh included),
    because that is what the game's height chain sizes against."""
    # Measured from evaluated VERTICES in the REST pose, not from bound_box.
    # bound_box is the undeformed cage and ignores both the armature modifier
    # and whatever pose happens to be loaded, so a rig imported mid-clip
    # measures whatever that frame happened to look like — which is how a
    # 1.75 m figure first came out claiming to be 1.33 m.
    was = arm_obj.data.pose_position
    arm_obj.data.pose_position = "REST"
    bpy.context.view_layer.update()

    def fighter_meshes():
        """Only the meshes bound to THIS armature. A stray object in the
        scene — an importer's leftover, a reference cube — must not set the
        fighter's height or drag the floor down under their feet, which is
        exactly what one did: a sphere at z=-1 pushed the whole rig a metre
        into the air and made the delivery measure a metre too tall."""
        out = []
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            bound = any(m.type == "ARMATURE" and m.object is arm_obj for m in obj.modifiers)
            if bound or obj.parent is arm_obj:
                out.append(obj)
        return out

    def world_bounds():
        deps = bpy.context.evaluated_depsgraph_get()
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        found = False
        for obj in fighter_meshes():
            ev = obj.evaluated_get(deps)
            mesh = ev.to_mesh()
            for v in mesh.vertices:
                p = ev.matrix_world @ v.co
                lo = Vector((min(lo[i], p[i]) for i in range(3)))
                hi = Vector((max(hi[i], p[i]) for i in range(3)))
                found = True
            ev.to_mesh_clear()
        return (lo, hi) if found else (None, None)

    lo, hi = world_bounds()
    if lo is None:
        arm_obj.data.pose_position = was
        report.append("  no mesh found — scale left untouched")
        return
    current_h = hi.z - lo.z  # Blender is Z-up; the exporter converts on the way out
    if current_h <= 0:
        arm_obj.data.pose_position = was
        report.append("  degenerate bounds — scale left untouched")
        return
    factor = target_h / current_h
    arm_obj.scale = tuple(s * factor for s in arm_obj.scale)
    bpy.context.view_layer.update()

    lo2, _ = world_bounds()
    arm_obj.location.z -= lo2.z
    arm_obj.data.pose_position = was
    bpy.context.view_layer.update()

    # Bake it into the data rather than leaving it on the node. A skinned mesh
    # renders at the size its JOINT matrices say, so a file carrying its scale
    # as a node transform cannot be measured from the glTF JSON at all — the
    # validator would have to apply inverse bind matrices to find out how tall
    # the fighter is. Applied transforms make the accessor bounds mean what
    # they appear to mean, for every tool downstream.
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    for child in arm_obj.children:
        if child.type == "MESH":
            child.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    report.append(f"  scaled ×{factor:.3f} to {target_h:.2f} m, feet on the floor, transforms applied")


def add_missing_hooks(arm_obj, props, chains, report):
    """Prop and chain bones the roster expects but the delivery lacks. Added
    empty: the hook exists (so clips and the validator can find it) and a
    rigger hangs the real geometry on it."""
    existing = {b.name for b in arm_obj.data.bones}
    wanted = []
    for p in props:
        if p not in existing:
            wanted.append((p, "RightHand" if p != "Prop_Float" else "Head", 0.12))
    for name, parent, segments in chains:
        for i in range(segments):
            bone = f"Chain_{name}_{i}"
            if bone not in existing:
                wanted.append((bone, parent if i == 0 else f"Chain_{name}_{i-1}", 0.1))
    if not wanted:
        return
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, length in wanted:
        eb = arm_obj.data.edit_bones.new(name)
        pb = arm_obj.data.edit_bones.get(parent)
        if pb:
            eb.head = pb.tail
            eb.tail = pb.tail + Vector((0, 0, -length))
            eb.parent = pb
        else:
            eb.head = (0, 0, 0)
            eb.tail = (0, 0, length)
        report.append(f"  added hook bone {name} (parent {parent})")
    bpy.ops.object.mode_set(mode="OBJECT")


# ------------------------------------------------------------------- timing

def canonical_action_name(name, states):
    """The state an action is for, allowing for the decoration importers add.

    Blender's glTF importer names actions `<clip>_<object>` — a file whose
    animations were called `idle`/`run` comes back in as `idle_Armature`,
    `run_Armature`. Exporting those verbatim produces glTF animations under
    those names, which the engine resolves by state name and therefore never
    plays: the fighter would load, register, and silently stand in the default
    pose forever. So the decoration is stripped and the action is RENAMED to
    the state, which is what the export then writes.
    """
    if name in states:
        return name
    # Longest state that prefixes the name, so `dodge_roll_Armature` picks
    # dodge_roll rather than stopping at a shorter match.
    for state in sorted(states, key=len, reverse=True):
        if name == state or name.startswith(state + "_") or name.startswith(state + "."):
            return state
    return None


def retime_actions(states, report):
    """Every action named for a state is renamed to exactly that state and
    scaled to its duration. Actions that are not a state at all are left alone
    and reported — a clip the engine will never play is a delivery problem,
    not something to silently rename into one."""
    bpy.context.scene.render.fps = FPS
    for action in bpy.data.actions:
        state = canonical_action_name(action.name, states)
        if state and action.name != state:
            report.append(f"  action '{action.name}' -> '{state}'")
            action.name = state
        spec = states.get(action.name)
        if not spec:
            report.append(f"  action '{action.name}' is not a state — left as-is, it will never play")
            continue
        start, end = action.frame_range
        span = end - start
        target = spec["duration"] * FPS
        if span <= 0:
            report.append(f"  action '{action.name}' has no span — cannot retime")
            continue
        factor = target / span
        for fcurve in action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.co.x = (kp.co.x - start) * factor + 1
                kp.handle_left.x = (kp.handle_left.x - start) * factor + 1
                kp.handle_right.x = (kp.handle_right.x - start) * factor + 1
            fcurve.update()
        beat = f", beat at frame {spec['beat'] * FPS:.1f}" if spec["beat"] else ""
        report.append(f"  '{action.name}' retimed ×{factor:.3f} -> {spec['duration']}s{beat}")


# ---------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_conform")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--char", required=True)
    args = ap.parse_args(argv)

    states = load_states()
    props, chains = load_expectations(args.char)
    target_h = canon_height_m(args.char)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)

    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input — a delivery must be a rigged model")

    report = [f"conforming {os.path.basename(args.src)} as '{args.char}':"]
    n = rename_bones(arm, report)
    report.append(f"  {n} bone(s) renamed onto the standard skeleton")
    missing = [b for b in STANDARD if b not in {x.name for x in arm.data.bones}]
    if missing:
        report.append(f"  STILL MISSING after renaming: {', '.join(missing)}")
    conform_scale_and_orientation(arm, target_h, report)
    add_missing_hooks(arm, props, chains, report)
    retime_actions(states, report)
    clean_all(arm, report)
    grade_char(args.char, report)

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    # Export the fighter only. `use_selection` with the armature hierarchy
    # selected keeps an importer's leftovers out of the delivery.
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
    print("next: node tools/billboard_intake.mjs validate " + args.char)


if __name__ == "__main__":
    main()
