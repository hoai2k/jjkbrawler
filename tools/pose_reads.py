"""Pose reads: sixteen joints per sprite frame, in the frame's own square cell.

A pose read is what a fighter's drawing says about where the body is, written
down as coordinates so a tool can check it and a rig can be posed from it. One
file per character in `sprites/docs/pose-reads/`, keyed by frame name.

THREE THINGS THIS MODULE FIXES IN ONE PLACE, BECAUSE GETTING ANY OF THEM WRONG
SILENTLY PRODUCES A PLAUSIBLE, WRONG READ:

  ORIENTATION. A read must describe the frame as the ENGINE draws it, not as
  the PNG happens to be stored. Some art was delivered facing left and the
  manifest marks it `faceLeft` (or lists it under `nativeLeft`); the engine
  mirrors those at blit time. `open_frame` mirrors them here too, so every
  read in the tree is of a fighter facing RIGHT. Read the raw PNG instead and
  a left-facing delivery comes out backwards — which is exactly the mistake
  this module exists to make impossible.

  SIDES. Joints are named for the CHARACTER's own left and right, never for
  the side of the screen they land on. With the fighter facing right, the
  camera is off their right shoulder: the RIGHT limb is the near one, the LEFT
  limb the far one. Sided names survive a mirror; "near" and "far" do not, and
  a rig posed from near/far data plays a left-handed punch on half the roster.

  THE CELL. Coordinates are percentages of the frame's own square cell: the
  frame scaled so its long side fills the square, centred, x rightwards, y
  downwards, both 0-100. Frames differ wildly in aspect (a prone drawing is
  939x208, an idle 423x1497), so the cell is what makes one read comparable
  with another and what the editor and the contact sheet both lay out in.
"""

import json
import os

from PIL import Image, ImageOps

import sprite_paths

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READS = os.path.join(ROOT, "sprites", "docs", "pose-reads")

#: A joint is [x, y] or [x, y, DEPTH]. Depth is toward the camera, in the same
#: cell percent, and it is absent until somebody sets it in the editor's 3D
#: view — the honest default, because a side-on drawing does not say how far a
#: fist travels toward the lens. Everything here reads two or three and writes
#: back what it was given.
DEPTH_LIMIT = 60


def depth(point):
    return float(point[2]) if len(point) > 2 else 0.0


#: The skeleton a read records, in draw order. Sided by the CHARACTER's own
#: left and right (see the module docstring), which is why the far limb —
#: drawn behind the body when the fighter faces right — is the LEFT one.
JOINTS = [
    "head", "neck", "chest", "pelvis",
    "shoulderL", "elbowL", "handL",
    "shoulderR", "elbowR", "handR",
    "hipL", "kneeL", "footL", "toeL",
    "hipR", "kneeR", "footR", "toeR",
]

# The sided pairs live next to swap_sides, below.

#: parent -> child, the segments a mannequin is drawn from and a rig posed by.
SEGMENTS = [
    ("pelvis", "chest"), ("chest", "neck"), ("neck", "head"),
    ("shoulderL", "elbowL"), ("elbowL", "handL"),
    ("shoulderR", "elbowR"), ("elbowR", "handR"),
    ("hipL", "kneeL"), ("kneeL", "footL"), ("footL", "toeL"),
    ("hipR", "kneeR"), ("kneeR", "footR"), ("footR", "toeR"),
]


def default_toe(foot, knee):
    """Where a toe sits when nobody has said — a short step from the ankle,
    square to the shin and pointing the way the fighter faces (right). It is a
    guess, and a visible one: the editor draws the foot, so a toe left at its
    default reads as a foot that has not been looked at yet."""
    dx, dy = foot[0] - knee[0], foot[1] - knee[1]
    length = (dx * dx + dy * dy) ** 0.5 or 1.0
    # Square to the shin, on the side the fighter faces.
    px, py = -dy / length, dx / length
    if px < 0:
        px, py = -px, -py
    return [round(min(100, max(0, foot[0] + px * 4)), 1),
            round(min(100, max(0, foot[1] + py * 4)), 1)]


#: The sided pairs, grouped, because arms and legs are misread INDEPENDENTLY.
#: In a punch the extended arm is the far one and the leading leg is the near
#: one — counter-rotation, which is what a body actually does — so a pose can
#: need its arms exchanged and its legs left exactly where they are.
SIDED_ARMS = [("shoulderL", "shoulderR"), ("elbowL", "elbowR"), ("handL", "handR")]
SIDED_LEGS = [("hipL", "hipR"), ("kneeL", "kneeR"), ("footL", "footR"), ("toeL", "toeR")]
#: The hip markers alone. They sit on the pelvis, which is a rigid bar, while
#: the legs hanging off them go wherever the stride puts them — so a pelvis
#: read the wrong way round is fixed without touching which leg leads. Same
#: for shoulders, where the arms are usually the thing that was right.
SIDED_HIPS = [("hipL", "hipR")]
SIDED_SHOULDERS = [("shoulderL", "shoulderR")]
SIDED = SIDED_ARMS + SIDED_LEGS


def swap_sides(joints, pairs=None):
    """The same pose with left and right exchanged. Not a mirror: the body does
    not move, only the labels — this is for a drawing whose near arm was read
    as the far one. Pass SIDED_ARMS or SIDED_LEGS to exchange only half."""
    out = dict(joints)
    for left, right in (pairs or SIDED):
        out[left], out[right] = joints[right], joints[left]
    return out

#: Frames that are not a fighter's body and have no pose to read.
SKIP_CHARS = {"effects"}


def manifest():
    with open(sprite_paths.MANIFEST) as fh:
        return json.load(fh)


def characters(man=None):
    man = man or manifest()
    return [c for c in man["characters"] if c not in SKIP_CHARS]


def frames(man, char):
    return sorted(k for k, v in man["characters"][char].items() if isinstance(v, dict))


def face_left(man, char, key):
    """True when the delivered art faces left and the engine mirrors it."""
    meta = man["characters"][char][key]
    return bool(meta.get("faceLeft")) or key in man.get("nativeLeft", {}).get(char, [])


def frame_path(man, char, key):
    return os.path.join(sprite_paths.CHAR, man["characters"][char][key]["file"])


def open_frame(man, char, key):
    """The frame as the engine draws it facing right — mirrored if delivered left."""
    im = Image.open(frame_path(man, char, key)).convert("RGBA")
    return ImageOps.mirror(im) if face_left(man, char, key) else im


def cell_mask(im, grid=200, threshold=60):
    """The frame's alpha, normalised into the square cell as a set of pixels."""
    w, h = im.size
    s = grid / max(w, h)
    mask = Image.new("L", (grid, grid), 0)
    alpha = im.split()[3].resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    mask.paste(alpha, ((grid - alpha.width) // 2, (grid - alpha.height) // 2))
    px = mask.load()
    return [(x, y) for y in range(grid) for x in range(grid) if px[x, y] > threshold]


def ink_bbox(ink, grid=200):
    """The drawing's extent in cell percent: (x0, y0, x1, y1)."""
    xs = [p[0] for p in ink]
    ys = [p[1] for p in ink]
    k = 100.0 / grid
    return min(xs) * k, min(ys) * k, max(xs) * k, max(ys) * k


def nearest_ink(x, y, ink, grid=200, overshoot=0.4):
    """The closest point ON the drawing to a cell coordinate, and how far it was.

    `overshoot` steps that far again past the boundary pixel, so a joint pulled
    onto a limb sits inside it rather than balanced on its outline.
    """
    cx, cy = x * grid / 100.0, y * grid / 100.0
    bx, by = min(ink, key=lambda p: (cx - p[0]) ** 2 + (cy - p[1]) ** 2)
    d = ((cx - bx) ** 2 + (cy - by) ** 2) ** 0.5 * 100.0 / grid
    nx = (bx + (bx - cx) * overshoot) * 100.0 / grid
    ny = (by + (by - cy) * overshoot) * 100.0 / grid
    return round(max(0.0, min(100.0, nx)), 1), round(max(0.0, min(100.0, ny)), 1), d


def read_path(char):
    return os.path.join(READS, f"{char}.json")


def load(char):
    with open(read_path(char)) as fh:
        return json.load(fh)


def dump(char, data):
    """Write a read file with one pose per stanza and joints four to a line.

    Hand-formatted rather than `json.dumps(indent=2)` because these files are
    reviewed and hand-edited: a joint table is a table, and sixteen coordinate
    pairs exploded over 80 lines is not one.
    """
    os.makedirs(READS, exist_ok=True)

    def num(v):
        return str(int(v)) if float(v) == int(v) else str(round(float(v), 1))

    def point(p):
        return "[" + ", ".join(num(v) for v in (p if len(p) > 2 and depth(p) else p[:2])) + "]"

    out = ["{"]
    for key in ("character", "facing", "_about", "_joints", "_seed"):
        if key in data:
            out.append(f"  {json.dumps(key)}: {json.dumps(data[key])},")
    out.append('  "poses": {')
    items = list(data["poses"].items())
    for i, (name, pose) in enumerate(items):
        out.append(f"    {json.dumps(name)}: {{")
        # `source` says a human placed this pose, and it is what stops a later
        # re-apply of an older export from quietly undoing their work
        # (tools/pose_apply.py). Dropping it here cost exactly that once.
        for key in ("read", "source", "seed"):
            if pose.get(key):
                out.append(f"      {json.dumps(key)}: {json.dumps(pose[key])},")
        if pose.get("flags"):
            chips = ", ".join(json.dumps(f, separators=(", ", ": ")) for f in pose["flags"])
            out.append(f'      "flags": [{chips}],')
        rows = [f'"{j}": {point(pose["j"][j])}' for j in JOINTS]
        lines = [", ".join(rows[a:a + 4]) for a in range(0, len(rows), 4)]
        out.append('      "j": {' + lines[0] + ",")
        for ln in lines[1:-1]:
            out.append("             " + ln + ",")
        out.append("             " + lines[-1] + "}")
        out.append("    }" + ("," if i < len(items) - 1 else ""))
    out += ["  }", "}"]
    with open(read_path(char), "w") as fh:
        fh.write("\n".join(out) + "\n")
