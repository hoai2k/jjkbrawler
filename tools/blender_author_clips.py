"""Author a fighter's animation clips onto their delivered rig, headless.

    blender --background --python tools/blender_author_clips.py -- \
        --in  billboards/assets/yuji/yuji.glb \
        --out billboards/intake/yuji/yuji.glb \
        --char yuji [--face-fix]

WHY POSES ARE DIRECTIONS, NOT ANGLES
------------------------------------
The obvious way to write a pose is Euler angles per bone. It does not survive
contact with a second rig. Angles are relative to a bone's REST orientation,
and rest orientations differ: the B0 mannequin is a T-pose with arms along X,
while the first generated delivery came back in an A-pose with arms hanging
down Z. Replaying the mannequin's angles on that rig swung every arm through
the floor, and every pose that moved a leg came apart.

So a pose here names, for each bone it cares about, the WORLD DIRECTION that
bone should point (head toward tail) in the character's own frame:

    forward = +Y      up = +Z      character's right = +X   (Blender axes)

`aim_bone` then solves the local rotation that achieves it, whatever the rest
pose happens to be. The vocabulary reads like stage directions — "upper arm
forward and a little down, forearm straight forward" is a punch — and the same
pose lands correctly on a T-pose rig, an A-pose rig, and the mannequin.

Bones a pose does not mention stay at rest, so each entry says only what it
changes.

THE CONTRACT, restated because this file is where it is honoured:
  * durations and contact beats come from billboards/src/states.js — combat is
    tuned so a strike lands the instant its hitbox goes live;
  * clips are AIM-NEUTRAL — the engine pitches the spine and solves the
    striking limb onto the target (ik.js), so a clip that bakes its own angle
    fights it;
  * no baked bob, squash, landing dip or roll spin — motion.js layers those on
    top and would double them;
  * looping clips repeat their first pose at the end so the seam does not pop.
"""

import argparse
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES_JS = os.path.join(REPO, "billboards", "src", "states.js")
FPS = 30


def load_states():
    src = open(STATES_JS, encoding="utf8").read()
    body = re.search(r"export const STATES = \{(.*?)\n\};", src, re.S)
    if not body:
        sys.exit("could not parse STATES out of billboards/src/states.js")
    out = {}
    for m in re.finditer(r"^  (\w+):\s*\{([^}]*)\}", body.group(1), re.M):
        name, fields = m.group(1), m.group(2)
        dur = re.search(r"duration:\s*([\d.]+)", fields)
        beat = re.search(r"beat:\s*([\d.]+)", fields)
        out[name] = {
            "duration": float(dur.group(1)) if dur else 0.5,
            "beat": float(beat.group(1)) if beat else None,
            "loop": "loop: true" in fields,
        }
    return out


# --------------------------------------------------------------- the poses
#
# Unit-ish direction vectors; they get normalised. Read them as: which way does
# this limb segment point, with the character facing +Y.

def V(x, y, z):
    return Vector((x, y, z)).normalized()

DOWN = V(0, 0, -1)
UP = V(0, 0, 1)
FWD = V(0, 1, 0)

POSES = {
    # ---- neutral -------------------------------------------------------
    "idle_a": {
        "Spine": V(0, 0.05, 1), "Spine1": V(0, 0.03, 1), "Spine2": V(0, 0.02, 1),
        "LeftArm": V(-0.16, 0.02, -0.99), "RightArm": V(0.16, 0.02, -0.99),
        "LeftForeArm": V(-0.10, 0.16, -0.98), "RightForeArm": V(0.10, 0.16, -0.98),
        "LeftUpLeg": V(-0.06, 0, -1), "RightUpLeg": V(0.06, 0, -1),
    },
    "idle_b": {
        "Spine": V(0, 0.09, 1), "Spine1": V(0, 0.05, 1), "Spine2": V(0, 0.01, 1),
        "LeftArm": V(-0.18, 0.03, -0.98), "RightArm": V(0.18, 0.03, -0.98),
        "LeftForeArm": V(-0.11, 0.20, -0.97), "RightForeArm": V(0.11, 0.20, -0.97),
        "LeftUpLeg": V(-0.06, 0, -1), "RightUpLeg": V(0.06, 0, -1),
    },
    # ---- locomotion ----------------------------------------------------
    "run_reach": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "LeftUpLeg": V(-0.05, 0.80, -0.60), "LeftLeg": V(0, 0.34, -0.94), "LeftFoot": V(0, 0.92, -0.39),
        "RightUpLeg": V(0.05, -0.55, -0.84), "RightLeg": V(0, -0.86, -0.51), "RightFoot": V(0, 0.42, -0.91),
        "LeftArm": V(-0.14, -0.52, -0.84), "LeftForeArm": V(-0.10, -0.30, -0.95),
        "RightArm": V(0.14, 0.50, -0.85), "RightForeArm": V(0.08, 0.72, -0.69),
    },
    "run_pass": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "LeftUpLeg": V(-0.05, 0.06, -1), "LeftLeg": V(0, -0.55, -0.84), "LeftFoot": V(0, 0.8, -0.6),
        "RightUpLeg": V(0.05, 0.02, -1), "RightLeg": V(0, -0.10, -0.99), "RightFoot": V(0, 0.9, -0.4),
        "LeftArm": V(-0.15, -0.15, -0.98), "LeftForeArm": V(-0.10, 0.10, -0.99),
        "RightArm": V(0.15, 0.15, -0.98), "RightForeArm": V(0.10, 0.35, -0.93),
    },
    "run_reach2": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "RightUpLeg": V(0.05, 0.80, -0.60), "RightLeg": V(0, 0.34, -0.94), "RightFoot": V(0, 0.92, -0.39),
        "LeftUpLeg": V(-0.05, -0.55, -0.84), "LeftLeg": V(0, -0.86, -0.51), "LeftFoot": V(0, 0.42, -0.91),
        "RightArm": V(0.14, -0.52, -0.84), "RightForeArm": V(0.10, -0.30, -0.95),
        "LeftArm": V(-0.14, 0.50, -0.85), "LeftForeArm": V(-0.08, 0.72, -0.69),
    },
    "dash": {
        "Spine": V(0, 0.46, 0.89), "Spine1": V(0, 0.26, 0.97), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.05, 0.40, -0.92), "LeftLeg": V(0, -0.10, -0.99),
        "RightUpLeg": V(0.05, -0.30, -0.95), "RightLeg": V(0, -0.55, -0.83),
        "LeftArm": V(-0.18, -0.55, -0.81), "RightArm": V(0.18, 0.30, -0.94),
        "RightForeArm": V(0.10, 0.62, -0.78),
    },
    "jump": {
        # Rising: knees drawn up, arms trailing DOWN AND BACK. Overhead arms
        # read as a dive and made jump and fall the same silhouette.
        "Spine": V(0, 0.16, 0.99), "Head": V(0, 0.10, 0.99),
        "LeftUpLeg": V(-0.06, 0.72, -0.69), "LeftLeg": V(0, -0.30, -0.95), "LeftFoot": V(0, 0.86, -0.5),
        "RightUpLeg": V(0.06, 0.30, -0.95), "RightLeg": V(0, -0.52, -0.85),
        "LeftArm": V(-0.22, -0.62, -0.75), "RightArm": V(0.22, -0.62, -0.75),
        "LeftForeArm": V(-0.16, -0.44, -0.88), "RightForeArm": V(0.16, -0.44, -0.88),
    },
    "fall": {
        # Falling: legs trailing and apart, arms out to the sides just above
        # the shoulder — braced, not cheering.
        "Spine": V(0, -0.14, 0.99), "Head": V(0, 0.14, 0.99),
        "LeftUpLeg": V(-0.14, -0.34, -0.93), "LeftLeg": V(0, 0.26, -0.97),
        "RightUpLeg": V(0.14, 0.34, -0.93), "RightLeg": V(0, -0.24, -0.97),
        "LeftArm": V(-0.72, -0.24, 0.65), "RightArm": V(0.72, -0.24, 0.65),
        "LeftForeArm": V(-0.62, -0.10, 0.78), "RightForeArm": V(0.62, -0.10, 0.78),
    },
    "land": {
        "Spine": V(0, 0.26, 0.97),
        "LeftUpLeg": V(-0.10, 0.30, -0.95), "LeftLeg": V(0, -0.42, -0.91),
        "RightUpLeg": V(0.10, 0.30, -0.95), "RightLeg": V(0, -0.42, -0.91),
        "LeftArm": V(-0.34, 0.22, -0.91), "RightArm": V(0.34, 0.22, -0.91),
        "LeftForeArm": V(-0.20, 0.45, -0.87), "RightForeArm": V(0.20, 0.45, -0.87),
    },
    "hurt": {
        "Spine": V(0, -0.34, 0.94), "Spine1": V(0, -0.22, 0.98), "Head": V(0, -0.45, 0.89),
        "LeftArm": V(-0.42, -0.42, -0.80), "RightArm": V(0.42, -0.42, -0.80),
        "LeftForeArm": V(-0.30, -0.55, -0.78), "RightForeArm": V(0.30, -0.55, -0.78),
        "LeftUpLeg": V(-0.08, -0.18, -0.98), "RightUpLeg": V(0.08, 0.10, -0.99),
    },
    "crouch_a": {
        "Spine": V(0, 0.40, 0.92), "Spine1": V(0, 0.24, 0.97), "Head": V(0, -0.24, 0.97),
        "LeftUpLeg": V(-0.22, 0.62, -0.75), "LeftLeg": V(0, -0.62, -0.79), "LeftFoot": V(0, 0.95, -0.3),
        "RightUpLeg": V(0.22, 0.62, -0.75), "RightLeg": V(0, -0.62, -0.79), "RightFoot": V(0, 0.95, -0.3),
        "LeftArm": V(-0.30, 0.26, -0.92), "RightArm": V(0.30, 0.26, -0.92),
        "LeftForeArm": V(-0.16, 0.62, -0.77), "RightForeArm": V(0.16, 0.62, -0.77),
    },
    "shield": {
        "Spine": V(0, 0.14, 0.99), "Head": V(0, 0.06, 1),
        "LeftArm": V(-0.42, 0.36, -0.83), "LeftForeArm": V(0.24, 0.52, 0.82),
        "RightArm": V(0.42, 0.36, -0.83), "RightForeArm": V(-0.24, 0.52, 0.82),
        "LeftUpLeg": V(-0.10, 0.14, -0.98), "LeftLeg": V(0, -0.18, -0.98),
        "RightUpLeg": V(0.10, 0.14, -0.98), "RightLeg": V(0, -0.18, -0.98),
    },
    "ledge": {
        "Spine": V(0, 0.06, 1),
        "LeftArm": V(-0.22, 0.10, 0.97), "LeftForeArm": V(-0.10, 0.06, 0.99),
        "RightArm": V(0.30, -0.10, 0.95), "RightForeArm": V(0.16, 0.20, 0.97),
        "LeftUpLeg": V(-0.08, 0.20, -0.98), "LeftLeg": V(0, -0.30, -0.95),
        "RightUpLeg": V(0.08, 0.06, -1), "RightLeg": V(0, -0.14, -0.99),
    },
    "tuck": {
        "Spine": V(0, 0.62, 0.78), "Spine1": V(0, 0.50, 0.87), "Head": V(0, 0.55, 0.84),
        "LeftUpLeg": V(-0.12, 0.86, -0.50), "LeftLeg": V(0, -0.55, -0.84),
        "RightUpLeg": V(0.12, 0.86, -0.50), "RightLeg": V(0, -0.55, -0.84),
        "LeftArm": V(-0.34, 0.55, -0.76), "LeftForeArm": V(-0.10, 0.86, -0.50),
        "RightArm": V(0.34, 0.55, -0.76), "RightForeArm": V(0.10, 0.86, -0.50),
    },
    "dizzy_a": {
        "Spine": V(0.10, -0.10, 0.99), "Head": V(0.28, -0.16, 0.94),
        "LeftArm": V(-0.30, -0.10, -0.95), "RightArm": V(0.30, -0.10, -0.95),
        "LeftForeArm": V(-0.24, 0.14, -0.96), "RightForeArm": V(0.24, 0.14, -0.96),
    },
    "dizzy_b": {
        "Spine": V(-0.10, -0.10, 0.99), "Head": V(-0.28, -0.16, 0.94),
        "LeftArm": V(-0.24, -0.06, -0.97), "RightArm": V(0.24, -0.06, -0.97),
        "LeftForeArm": V(-0.30, 0.10, -0.95), "RightForeArm": V(0.30, 0.10, -0.95),
    },
    "prone": {
        # Flat on the back: the whole body lies along the ground plane.
        "Spine": V(0, -0.99, 0.10), "Spine1": V(0, -1, 0.05), "Spine2": V(0, -1, 0),
        "Neck": V(0, -0.96, 0.28), "Head": V(0, -0.96, 0.28),
        "LeftUpLeg": V(-0.10, -0.98, 0.16), "LeftLeg": V(0, -0.99, -0.10),
        "RightUpLeg": V(0.10, -0.98, 0.16), "RightLeg": V(0, -0.99, -0.10),
        "LeftArm": V(-0.60, -0.72, 0.34), "RightArm": V(0.60, -0.72, 0.34),
    },
    "win": {
        "Spine": V(0, -0.06, 1), "Head": V(0, -0.10, 0.99),
        "RightArm": V(0.26, -0.10, 0.96), "RightForeArm": V(0.10, 0.06, 0.99),
        "LeftArm": V(-0.24, 0.10, -0.96), "LeftForeArm": V(-0.14, 0.34, -0.93),
    },
    # ---- strikes -------------------------------------------------------
    "jab_wind": {
        "Spine2": V(-0.16, -0.06, 0.98),
        "RightArm": V(0.30, -0.30, -0.90), "RightForeArm": V(0.20, 0.30, -0.93),
        "LeftArm": V(-0.24, 0.20, -0.95), "LeftForeArm": V(-0.10, 0.60, -0.79),
    },
    "jab": {
        "Spine2": V(0.14, 0.10, 0.98),
        "RightArm": V(0.14, 0.86, -0.49), "RightForeArm": V(0.04, 0.99, -0.10),
        "LeftArm": V(-0.26, 0.10, -0.96), "LeftForeArm": V(-0.12, 0.66, -0.74),
    },
    "hook_wind": {
        "Spine1": V(-0.18, -0.10, 0.98), "Spine2": V(-0.26, -0.14, 0.95),
        "RightArm": V(0.52, -0.62, -0.59), "RightForeArm": V(0.30, -0.30, -0.90),
        "LeftArm": V(-0.20, 0.24, -0.95),
    },
    "hook": {
        "Spine1": V(0.16, 0.12, 0.98), "Spine2": V(0.26, 0.18, 0.95),
        "RightArm": V(0.20, 0.90, -0.38), "RightForeArm": V(0.02, 0.99, -0.06),
        "LeftArm": V(-0.30, -0.10, -0.95), "LeftForeArm": V(-0.16, 0.30, -0.94),
    },
    "uppercut": {
        "Spine1": V(0, -0.10, 0.99), "Spine2": V(0.10, -0.14, 0.98),
        "RightArm": V(0.16, 0.36, 0.92), "RightForeArm": V(0.06, 0.18, 0.98),
        "LeftArm": V(-0.26, 0.10, -0.96), "LeftForeArm": V(-0.14, 0.50, -0.85),
    },
    "chop_wind": {
        "Spine1": V(0, -0.16, 0.99),
        "RightArm": V(0.24, -0.20, 0.95), "RightForeArm": V(0.12, -0.10, 0.99),
        "LeftArm": V(-0.24, -0.16, 0.96),
    },
    "chop": {
        "Spine": V(0, 0.44, 0.90), "Spine1": V(0, 0.30, 0.95), "Head": V(0, 0.20, 0.98),
        "RightArm": V(0.16, 0.70, -0.70), "RightForeArm": V(0.06, 0.62, -0.78),
        "LeftArm": V(-0.20, 0.30, -0.93),
    },
    "kick_air": {
        "Spine": V(0, -0.24, 0.97), "Head": V(0, 0.16, 0.99),
        "LeftUpLeg": V(-0.08, 0.90, -0.43), "LeftLeg": V(0, 0.98, -0.20), "LeftFoot": V(0, 0.99, -0.10),
        "RightUpLeg": V(0.10, -0.30, -0.95), "RightLeg": V(0, -0.40, -0.92),
        "LeftArm": V(-0.42, -0.20, -0.88), "RightArm": V(0.50, 0.10, -0.86),
    },
    "low_jab": {
        "Spine": V(0, 0.44, 0.90), "Spine1": V(0, 0.26, 0.97), "Head": V(0, -0.26, 0.96),
        "LeftUpLeg": V(-0.22, 0.62, -0.75), "LeftLeg": V(0, -0.62, -0.79),
        "RightUpLeg": V(0.22, 0.62, -0.75), "RightLeg": V(0, -0.62, -0.79),
        "RightArm": V(0.16, 0.88, -0.44), "RightForeArm": V(0.04, 0.99, -0.14),
        "LeftArm": V(-0.28, 0.20, -0.94),
    },
    # ---- identity: Yuji's kit -------------------------------------------
    # Divergent Fist — one punch, the cursed energy a beat behind it. Both
    # fists commit; the front one lands and the back one is already loaded.
    "divergent": {
        "Spine1": V(0.10, 0.14, 0.98), "Spine2": V(0.16, 0.16, 0.97),
        "RightArm": V(0.12, 0.92, -0.37), "RightForeArm": V(0.02, 1, -0.04),
        "LeftArm": V(-0.30, -0.24, -0.92), "LeftForeArm": V(-0.14, 0.20, -0.97),
    },
    # Manji Kick — the sliding low sweep.
    "manji": {
        "Spine": V(0, 0.30, 0.95), "Spine1": V(0, 0.20, 0.98), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.10, 0.94, -0.32), "LeftLeg": V(0, 0.99, -0.10), "LeftFoot": V(0, 0.98, -0.20),
        "RightUpLeg": V(0.22, 0.30, -0.93), "RightLeg": V(0, -0.66, -0.75),
        "LeftArm": V(-0.50, -0.30, -0.81), "RightArm": V(0.44, 0.24, -0.87),
        "RightForeArm": V(0.20, 0.62, -0.76),
    },
    # Unbreakable Grit — plants and refuses to fall.
    "grit": {
        "Spine": V(0, 0.24, 0.97), "Spine1": V(0, 0.16, 0.99), "Head": V(0, -0.10, 0.99),
        "LeftUpLeg": V(-0.30, 0.20, -0.93), "LeftLeg": V(0, -0.24, -0.97),
        "RightUpLeg": V(0.30, 0.20, -0.93), "RightLeg": V(0, -0.24, -0.97),
        "LeftArm": V(-0.44, 0.30, -0.85), "LeftForeArm": V(0.30, 0.46, -0.83),
        "RightArm": V(0.44, 0.30, -0.85), "RightForeArm": V(-0.30, 0.46, -0.83),
    },
    # Black Flash — the wind-up, coiled to the back foot.
    "flash_wind": {
        "Spine": V(0, -0.20, 0.98), "Spine1": V(-0.24, -0.16, 0.96), "Spine2": V(-0.34, -0.20, 0.92),
        "Head": V(0.20, 0.10, 0.97),
        "RightArm": V(0.56, -0.66, -0.50), "RightForeArm": V(0.40, -0.44, -0.80),
        "LeftArm": V(-0.30, 0.34, -0.89), "LeftForeArm": V(-0.10, 0.72, -0.69),
        "LeftUpLeg": V(-0.16, 0.34, -0.93), "RightUpLeg": V(0.24, -0.24, -0.94),
    },
    # ...and the strike, everything behind it.
    "flash": {
        "Spine": V(0, 0.24, 0.97), "Spine1": V(0.24, 0.22, 0.95), "Spine2": V(0.34, 0.26, 0.90),
        "Head": V(0, 0.10, 0.99),
        "RightArm": V(0.14, 0.94, -0.30), "RightForeArm": V(0.02, 1, 0),
        "LeftArm": V(-0.34, -0.30, -0.89), "LeftForeArm": V(-0.16, 0.10, -0.98),
        "LeftUpLeg": V(-0.10, 0.50, -0.86), "RightUpLeg": V(0.20, -0.34, -0.92),
    },
    "charge_a": {
        "Spine": V(0, 0.26, 0.96), "Spine1": V(0, 0.16, 0.99), "Head": V(0, -0.16, 0.99),
        "LeftUpLeg": V(-0.24, 0.30, -0.92), "LeftLeg": V(0, -0.36, -0.93),
        "RightUpLeg": V(0.24, 0.30, -0.92), "RightLeg": V(0, -0.36, -0.93),
        "LeftArm": V(-0.40, -0.24, -0.88), "LeftForeArm": V(-0.16, 0.40, -0.90),
        "RightArm": V(0.40, -0.24, -0.88), "RightForeArm": V(0.16, 0.40, -0.90),
    },
    "charge_b": {
        "Spine": V(0, 0.32, 0.95), "Spine1": V(0, 0.20, 0.98), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.26, 0.36, -0.90), "LeftLeg": V(0, -0.44, -0.90),
        "RightUpLeg": V(0.26, 0.36, -0.90), "RightLeg": V(0, -0.44, -0.90),
        "LeftArm": V(-0.44, -0.30, -0.85), "LeftForeArm": V(-0.20, 0.30, -0.93),
        "RightArm": V(0.44, -0.30, -0.85), "RightForeArm": V(0.20, 0.30, -0.93),
    },
}

# Hip drop per state, as a fraction of rig height. Applied as a LOCATION delta
# on the hip bone — relative, so it means the same thing on any rig. (The B0
# default set wrote absolute mannequin-space positions here, which is precisely
# why its crouch exploded on a delivered rig.)
HIP_DROP = {
    "crouch": 0.16, "crouchAttack": 0.16, "charge": 0.07,
    "dodge_roll": 0.24, "dodge_air": 0.20, "prone": 0.44,
    "specialSide": 0.16, "land": 0.05,
}

# time (fraction of duration unless a beat is named) -> pose
def state_keys(name, spec):
    d = spec["duration"]
    beat = spec["beat"]
    K = lambda *pairs: list(pairs)
    if name == "idle":   return K((0, "idle_a"), (d / 2, "idle_b"), (d, "idle_a"))
    if name == "run":    return K((0, "run_reach"), (d / 4, "run_pass"), (d / 2, "run_reach2"), (3 * d / 4, "run_pass"), (d, "run_reach"))
    if name == "dash":   return K((0, "dash"), (d, "dash"))
    if name == "jump":   return K((0, "jump"), (d, "jump"))
    if name == "fall":   return K((0, "fall"), (d, "fall"))
    if name == "land":   return K((0, "land"), (d, "land"))
    if name == "hurt":   return K((0, "hurt"), (d, "hurt"))
    if name == "crouch": return K((0, "crouch_a"), (d, "crouch_a"))
    if name == "shield": return K((0, "shield"), (d, "shield"))
    if name == "ledge":  return K((0, "ledge"), (d, "ledge"))
    if name in ("dodge_roll", "dodge_air"): return K((0, "tuck"), (d, "tuck"))
    if name == "dizzy":  return K((0, "dizzy_a"), (d / 2, "dizzy_b"), (d, "dizzy_a"))
    if name == "prone":  return K((0, "prone"), (d, "prone"))
    if name == "win":    return K((0, "win"), (d, "win"))
    if name == "light":         return K((0, "jab_wind"), (beat, "jab"), (d, "jab"))
    if name == "airLight":      return K((0, "idle_a"), (beat, "kick_air"), (d, "kick_air"))
    if name == "sideHeavy":     return K((0, "hook_wind"), (beat, "hook"), (d, "hook"))
    if name == "upHeavy":       return K((0, "jab_wind"), (beat, "uppercut"), (d, "uppercut"))
    if name == "downHeavy":     return K((0, "chop_wind"), (beat, "chop"), (d, "chop"))
    if name == "crouchAttack":  return K((0, "crouch_a"), (beat, "low_jab"), (d, "low_jab"))
    if name == "charge":        return K((0, "charge_a"), (d / 2, "charge_b"), (d, "charge_a"))
    if name == "specialNeutral": return K((0, "jab_wind"), (beat, "divergent"), (d, "divergent"))
    if name == "specialSide":    return K((0, "crouch_a"), (beat, "manji"), (d, "manji"))
    if name == "specialDown":    return K((0, "idle_a"), (beat, "grit"), (d, "grit"))
    if name == "ult":            return K((0, "flash_wind"), (d / 2, "flash"), (d, "flash_wind"))
    return K((0, "idle_a"), (d, "idle_a"))


# ------------------------------------------------------------- the solver

# The character's own frame, derived from the rig rather than assumed. A pose
# vector is written as (right, forward, up) in the fighter's terms; this turns
# it into world space. Deriving it means the vocabulary survives a rig that
# arrives facing any direction — including one that has just been turned 180°
# by the face-fix, which is exactly the case that first got authored backwards.
BASIS = {"right": Vector((1, 0, 0)), "fwd": Vector((0, 1, 0)), "up": Vector((0, 0, 1))}


def derive_basis(arm_obj):
    """Forward comes from the feet: toes point where the fighter faces."""
    up = Vector((0, 0, 1))
    fwd = None
    for name in ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"):
        b = arm_obj.data.bones.get(name)
        if not b:
            continue
        d = (arm_obj.matrix_world @ b.tail_local) - (arm_obj.matrix_world @ b.head_local)
        d.z = 0
        if d.length > 1e-4:
            fwd = d.normalized()
            break
    if fwd is None:
        fwd = Vector((0, 1, 0))
    BASIS["fwd"] = fwd
    BASIS["up"] = up
    BASIS["right"] = fwd.cross(up).normalized()
    return BASIS


def to_world(v):
    """(right, forward, up) in the character's frame -> world direction."""
    return (BASIS["right"] * v.x + BASIS["fwd"] * v.y + BASIS["up"] * v.z).normalized()


def bone_world_dir(arm_obj, pbone):
    """Current head->tail direction of a pose bone, in world space."""
    mw = arm_obj.matrix_world
    return ((mw @ pbone.tail) - (mw @ pbone.head)).normalized()


def aim_bone(arm_obj, pbone, want_world):
    """Rotate `pbone` so it points along `want_world`, whatever its rest
    orientation. The delta is computed in world space and converted into the
    bone's own local frame, so it composes with the parent chain already
    posed above it (parents are always solved first)."""
    cur = bone_world_dir(arm_obj, pbone)
    if cur.length < 1e-8 or want_world.length < 1e-8:
        return
    want = want_world.normalized()
    dot = max(-1.0, min(1.0, cur.dot(want)))
    if dot > 0.999999:
        return
    axis = cur.cross(want)
    if axis.length < 1e-8:
        # Exactly opposed: any perpendicular axis turns it around.
        axis = cur.orthogonal()
    delta = Quaternion(axis.normalized(), math.acos(dot))

    # world delta -> local. The pose bone's world rotation is the armature's
    # rotation times its own chain; solving in the parent's frame keeps the
    # result independent of everything above it.
    mw = arm_obj.matrix_world.to_quaternion()
    parent_w = mw @ (pbone.parent.matrix.to_quaternion() if pbone.parent else Quaternion())
    rest = pbone.bone.matrix_local.to_quaternion()
    if pbone.parent:
        rest = pbone.parent.bone.matrix_local.to_quaternion().inverted() @ rest
    target_w = delta @ (mw @ pbone.matrix.to_quaternion())
    local = parent_w.inverted() @ target_w
    pbone.rotation_mode = "QUATERNION"
    pbone.rotation_quaternion = rest.inverted() @ local
    # Push the change through so children solve against a posed parent.
    bpy.context.view_layer.update()


# Parents before children, so a chain solves top-down.
ORDER = [
    "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]


def manifest_height(char):
    """The delivered height from whichever model manifest carries this
    character. Both backends record the same figure at import."""
    import json
    for rel in ("billboards/assets/manifest.json", "render3d/assets/manifest.json"):
        path = os.path.join(REPO, rel)
        if not os.path.exists(path):
            continue
        try:
            entry = json.load(open(path)).get("characters", {}).get(char)
        except Exception:
            continue
        if entry and entry.get("heightM"):
            return float(entry["heightM"])
    return None


def hip_bone(arm_obj):
    for name in ("Hips", "mixamorig:Hips", "Pelvis", "pelvis"):
        pb = arm_obj.pose.bones.get(name)
        if pb:
            return pb
    return None


def apply_pose(arm_obj, pose, hip_drop_m):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    hb = hip_bone(arm_obj)
    if hb and hip_drop_m:
        # Down in the hip bone's own space, so it survives any rest orientation.
        mw = arm_obj.matrix_world.to_quaternion()
        world_down = Vector((0, 0, -hip_drop_m))
        local = (mw @ hb.bone.matrix_local.to_quaternion()).inverted() @ world_down
        hb.location = local
    for name in ORDER:
        want = pose.get(name)
        if not want:
            continue
        pb = arm_obj.pose.bones.get(name)
        if pb:
            aim_bone(arm_obj, pb, to_world(want))
    bpy.context.view_layer.update()


def build_action(arm_obj, name, spec, height):
    keys = state_keys(name, spec)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm_obj.animation_data.action = action
    drop = HIP_DROP.get(name, 0) * height
    hb = hip_bone(arm_obj)
    touched = set()
    for t, pose_name in keys:
        pose = POSES[pose_name]
        touched |= set(pose.keys())
        apply_pose(arm_obj, pose, drop)
        frame = 1 + t * FPS
        for bone_name in ORDER:
            pb = arm_obj.pose.bones.get(bone_name)
            if pb:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
        if hb:
            hb.keyframe_insert("location", frame=frame)
    return action, touched


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_author_clips")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--face-fix", action="store_true",
                    help="turn the rig 180 degrees so it faces +Z in glTF, per the delivery spec")
    args = ap.parse_args(argv)

    states = load_states()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input")

    # Height for the hip-drop scaling. The manifest's figure is the one the
    # game sizes against (it is what intake measured and what headHeightTarget
    # is solved from), so prefer it over measuring here: evaluating the mesh in
    # REST reported 2.73 m for a 1.73 m fighter, because this rig's bind pose
    # and rest pose are not the same and the modifier drags vertices. A hip
    # drop scaled off that would sink every crouch through the floor.
    was = arm.data.pose_position
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    lo = hi = None
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(deps)
        m = ev.to_mesh()
        for v in m.vertices:
            p = ev.matrix_world @ v.co
            lo = p.z if lo is None else min(lo, p.z)
            hi = p.z if hi is None else max(hi, p.z)
        ev.to_mesh_clear()
    measured = (hi - lo) if lo is not None else 1.75
    arm.data.pose_position = was
    height = manifest_height(args.char) or measured

    if args.face_fix:
        # The spec is +Z forward in glTF. Blender exports +Y as -Z, so a rig
        # whose toes point +Y here arrives facing backwards — which is exactly
        # how the first delivery came in, and why it rendered from behind.
        #
        # Done HERE, before a single action exists, because transform_apply
        # refuses on an animated object and reports it as a warning rather than
        # an error: applied after authoring, it silently did nothing and the
        # rig exported still facing backwards. Baking it into the data (rather
        # than leaving a rotation on the node) also matters downstream — the IK
        # builds its target in the rig root's frame, so a body rotated relative
        # to that root would reach backwards.
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        for c in arm.children:
            c.select_set(True)
        bpy.context.view_layer.objects.active = arm
        # Through the matrix, not rotation_euler: the glTF importer leaves
        # objects in QUATERNION rotation mode, where writing rotation_euler is
        # silently ignored — which is how the first attempt "succeeded" and
        # changed nothing.
        turn = Matrix.Rotation(math.pi, 4, "Z")
        arm.matrix_world = turn @ arm.matrix_world
        for c in arm.children:
            if c.parent is arm:
                continue  # rides the parent
            c.matrix_world = turn @ c.matrix_world
        bpy.context.view_layer.update()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        toe = arm.data.bones.get("LeftToeBase") or arm.data.bones.get("LeftFoot")
        if toe:
            d = (arm.matrix_world @ toe.tail_local) - (arm.matrix_world @ toe.head_local)
            if d.y > 0:
                sys.exit("face-fix did not take: toes still point +Y (would export facing -Z)")

    derive_basis(arm)

    if not arm.animation_data:
        arm.animation_data_create()

    f = BASIS["fwd"]
    report = [f"authoring {args.char}: {height:.2f} m (manifest), forward=({f.x:+.2f},{f.y:+.2f},{f.z:+.2f})"]
    for name, spec in states.items():
        if name == "dodge":
            continue  # alias; never authored (states.js)
        action, touched = build_action(arm, name, spec, height)
        beat = f", beat {spec['beat']}s" if spec["beat"] else ""
        report.append(f"  {name:<15} {len(state_keys(name, spec))} keys, {spec['duration']}s{beat}, {len(touched)} bones")

    # Clear the pose so the exported rest is the rest.
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    arm.animation_data.action = None

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for c in arm.children:
        c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.dst, use_selection=True, export_format="GLB",
        export_animations=True, export_animation_mode="ACTIONS",
        export_yup=True, export_apply=False,
    )
    print("\n".join(report))
    print(f"wrote {args.dst}")


if __name__ == "__main__":
    main()
