#!/usr/bin/env python3
"""Cut the karma wheel out of Mahoraga's 31 poses and make it a prop.

The wheel that hovers over Mahoraga's head was drawn INTO every pose. That is
wrong in two ways at once. It rotates with him — the renderer tumbles a sprite
about its centre of mass, so a dodge roll sends the wheel round with the body
when it should hang level. And it was keyed 31 separate times, so the gaps
between its spokes are clean on some frames and filled with leftover magenta on
others.

Both problems are the same mistake, and both go away if the wheel is one sprite
drawn separately. This does that cut, once:

  --board   mark what would be removed, and write nothing
  --extract take the cleanest wheel and save it as the prop
  --strip   remove the wheel from all 31 poses

FINDING IT. The wheel is bronze and the rest of Mahoraga is not: white skin,
black hair, blue-grey hakama. Across his whole sheet there is exactly one warm,
saturated region of any size, and it is the wheel — so the search is by hue, not
by position, which means it does not care where a pose puts it or how the pose
is framed.

The mask is grown from that warm core rather than being the core itself, because
the wheel's dark outline is not warm and would be left behind as a halo. Growth
is bounded by what the core is connected to, so a dilation that brushes a hair
strand cannot drag the body in with it.

WHY THE SPIKE TIPS NEED A SECOND PASS. Eight spikes ring the wheel, and their
tips join the rim through a dark antialiased neck that fails the warm test. The
first pass leaves them behind as small orphans — visible as two stubs beside the
rim on `fall`. So any warm blob lying within GATHER px of the core is taken as
part of the wheel too. That distance is what separates a spike tip from the tan
bandages on his wrists, which are warm, far away, and must stay.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:
    sys.exit("scipy is required: pip install scipy")

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
POSES = os.path.join(SPRITES, "mahoraga")
PROP = os.path.join(SPRITES, "effects", "mahoraga_wheel.png")

# Warm and saturated: the bronze of the wheel, plus whatever key colour is still
# sitting in the gaps between its spokes.
HUE_LO, HUE_HI = 30, 225      # warm is BELOW the first or ABOVE the second
SAT_MIN, VAL_MIN = 60, 40

CORE_MIN_PX = 2000            # below this there is no wheel in the frame
OUTLINE_GROW = 7              # to take the wheel's dark rim with it
GATHER = 40                   # how far a detached spike tip can sit from the rim


def warm_mask(a):
    op = a[:, :, 3] > 8
    hsv = np.array(Image.fromarray(a[:, :, :3]).convert("HSV")).astype(int)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    return op & (((h <= HUE_LO) | (h >= HUE_HI)) & (s >= SAT_MIN) & (v >= VAL_MIN))


def wheel_mask(a):
    """Every pixel of the wheel in this frame, or None if there is no wheel."""
    op = a[:, :, 3] > 8
    warm = warm_mask(a)
    lab, n = ndimage.label(warm, structure=np.ones((3, 3), np.int8))
    if not n:
        return None
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    if sizes.max() < CORE_MIN_PX:
        return None

    core = lab == int(np.argmax(sizes))
    # Orphaned spike tips: warm, small, and right next to the rim.
    near = ndimage.binary_dilation(core, iterations=GATHER)
    for i in np.nonzero(sizes)[0]:
        blob = lab == i
        if blob is not core.any() and (blob & near).any():
            core = core | blob

    grown = ndimage.binary_dilation(ndimage.binary_fill_holes(core),
                                    iterations=OUTLINE_GROW) & op
    lab2, _ = ndimage.label(grown, structure=np.ones((3, 3), np.int8))
    keep = set(lab2[core].ravel().tolist()) - {0}
    return np.isin(lab2, list(keep))


def key_leftover(a):
    """Pixels that are still the raw key colour: near-pure magenta."""
    rgb = a[:, :, :3].astype(int)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (a[:, :, 3] > 8) & (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 60)


def cleanliness(a, mask):
    """How badly this frame's wheel was keyed.

    The gaps between the spokes should be transparent. Where the key survived
    they are opaque magenta — and because magenta is warm, the mask has already
    swallowed them, so they are not holes to be counted but pixels INSIDE the
    wheel that should not be there. That is the number, and it is what decides
    which frame the prop is cut from.
    """
    return int((mask & key_leftover(a)).sum())


def clipped(a, mask):
    """True when the wheel runs off the plate rather than merely touching it.

    Almost every frame has the top spike at row zero, which is framing, not
    damage. A cut shows as a FLAT run along the border, so that is what is
    measured — several pixels of the silhouette lying dead straight on an edge.
    """
    h, w = mask.shape
    edges = (mask[0, :], mask[h - 1, :], mask[:, 0], mask[:, w - 1])
    for line in edges:
        idx = np.nonzero(line)[0]
        if len(idx) >= 12 and (idx[-1] - idx[0]) == len(idx) - 1:
            return True
    return False


def frames():
    return sorted(f for f in os.listdir(POSES) if f.endswith(".png"))


def survey():
    out = []
    for f in frames():
        a = np.array(Image.open(os.path.join(POSES, f)).convert("RGBA"))
        m = wheel_mask(a)
        if m is None:
            out.append((f[:-4], None, 0, 0, 0))
            continue
        out.append((f[:-4], m, int(m.sum()), cleanliness(a, m), clipped(a, m)))
    return out


def board(path):
    from PIL import ImageDraw
    tiles = []
    for name, m, px, dirty, edge in survey():
        a = np.array(Image.open(os.path.join(POSES, name + ".png")).convert("RGBA"))
        v = a.copy()
        if m is not None:
            v[m] = [60, 255, 140, 255]
        im = Image.fromarray(v).crop((0, 0, a.shape[1], min(520, a.shape[0])))
        bg = Image.new("RGBA", im.size, (22, 24, 30, 255))
        bg.alpha_composite(im)
        bg.thumbnail((190, 190))
        t = Image.new("RGB", (196, 232), (34, 37, 46))
        t.paste(bg.convert("RGB"), (3, 22))
        d = ImageDraw.Draw(t)
        d.text((5, 5), name, fill=(240, 240, 250))
        d.text((5, 216), f"{px} px · {dirty} key left" + (" · clipped" if edge else ""),
               fill=(255, 140, 140) if dirty else (140, 220, 160))
        tiles.append(t)
    cols = 8
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGB", (cols * 200 + 8, rows * 240 + 30), (20, 22, 28))
    ImageDraw.Draw(out).text((10, 8), "Mahoraga's wheel — green is what would be cut",
                             fill=(120, 255, 180))
    for i, t in enumerate(tiles):
        out.paste(t, (6 + (i % cols) * 200, 26 + (i // cols) * 240))
    out.save(path)
    return path


def extract(pose=None):
    """Save the cleanest wheel as the prop, with its gaps keyed out properly."""
    rows = [r for r in survey() if r[1] is not None and not r[4]]
    if pose:
        rows = [r for r in rows if r[0] == pose]
    if not rows:
        sys.exit("no usable wheel found")
    # Biggest first. The leftover key is cut below whichever frame is chosen, so
    # it does not rank them — what cannot be recovered later is resolution, and
    # the frames that draw the wheel largest are the ones nearest the camera.
    rows.sort(key=lambda r: -r[2])
    name, mask, px, dirty, _ = rows[0]

    a = np.array(Image.open(os.path.join(POSES, name + ".png")).convert("RGBA"))
    out = np.zeros_like(a)
    out[mask] = a[mask]

    # Whatever key survived between the spokes is cut here, once, instead of
    # being left in 31 copies. It only ever sits in the gaps, so removing it
    # opens them without touching the bronze.
    out[key_leftover(a) & mask, 3] = 0
    # …and the ragged edge it leaves behind: pixels that were blended with the
    # key rather than being it outright.
    kept = out[:, :, 3] > 8
    rgb = out[:, :, :3].astype(int)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    halo = kept & (np.minimum(r, b) - g > 45) & (g < 0.6 * np.minimum(r, b))
    edge = ndimage.binary_dilation(out[:, :, 3] <= 8, iterations=2)
    out[halo & edge, 3] = 0

    # A horn tip passing behind the rim comes away attached to it, so it is not
    # caught by the one-piece rule below. It is white where the wheel is bronze,
    # which is the whole reason the wheel was findable in the first place.
    hsv = np.array(Image.fromarray(out[:, :, :3]).convert("HSV")).astype(int)
    pale = (out[:, :, 3] > 8) & (hsv[:, :, 1] < 45) & (hsv[:, :, 2] > 140)
    lab_p, n_p = ndimage.label(pale, structure=np.ones((3, 3), np.int8))
    if n_p:
        for i in range(1, n_p + 1):
            blob = lab_p == i
            if blob.sum() >= 20:
                out[blob] = 0

    # The grown mask picks up a few flecks of horn or hair passing behind the
    # rim. They are tiny and detached, and the wheel is one piece.
    solid = out[:, :, 3] > 8
    lab, n = ndimage.label(solid, structure=np.ones((3, 3), np.int8))
    if n > 1:
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        out[(lab != int(np.argmax(sizes))) & solid] = 0

    ys, xs = np.nonzero(out[:, :, 3] > 8)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    os.makedirs(os.path.dirname(PROP), exist_ok=True)
    Image.fromarray(out).save(PROP, optimize=True)
    return name, PROP, out.shape[1], out.shape[0], dirty


def strip():
    changed = []
    for f in frames():
        path = os.path.join(POSES, f)
        a = np.array(Image.open(path).convert("RGBA"))
        m = wheel_mask(a)
        if m is None:
            continue
        a[m] = 0
        ys, xs = np.nonzero(a[:, :, 3] > 8)
        # The frame is NOT re-cropped. Every ox / bodyBottom / anchor in the
        # manifest is measured against these bounds, so trimming to the new
        # silhouette would silently move the whole pose.
        Image.fromarray(a).save(path, optimize=True)
        changed.append((f[:-4], int(m.sum()), int(ys.min())))
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", metavar="PATH", help="write a verification board")
    ap.add_argument("--extract", action="store_true", help="save the prop sprite")
    ap.add_argument("--from-pose", help="force which pose the prop is cut from")
    ap.add_argument("--strip", action="store_true", help="remove the wheel from all poses")
    args = ap.parse_args()

    if args.board:
        print("  " + board(args.board))
    if args.extract:
        name, path, w, h, dirty = extract(args.from_pose)
        print(f"  prop cut from {name}: {w}x{h} -> {os.path.relpath(path)}"
              f" ({dirty} key px in its gaps, now transparent)")
    if args.strip:
        rows = strip()
        for name, px, top in rows:
            print(f"  {name:18} removed {px:6} px; art now starts at row {top}")
        print(f"{len(rows)} pose(s) stripped")
    if not (args.board or args.extract or args.strip):
        for name, m, px, dirty, edge in survey():
            print(f"  {name:18} {px:7} px  {dirty:6} key left"
                  + ("  CLIPPED" if edge else ""))


if __name__ == "__main__":
    main()
