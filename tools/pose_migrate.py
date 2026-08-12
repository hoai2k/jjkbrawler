"""One-off migrations for the pose read files, kept so the next one is easy.

A read's joint set is not frozen: it grows when the 3D side turns out to need
something the drawing can say. Each migration below is idempotent, takes the
files as they are and leaves them canonical, and is named for the change it
makes rather than a date, because what matters when reading this later is what
it did, not when.

    python3 tools/pose_migrate.py toes          # add toeL/toeR where missing
    python3 tools/pose_migrate.py snap-toes     # ...and pull them onto the shoe
    python3 tools/pose_migrate.py swap [arms|legs] yuji attack_air ...
"""

import sys

import pose_reads as pr


def add_toes(chars):
    """Give every pose a toe. Feet were the end of the chain, so a foot could
    be placed and its ORIENTATION could not — which is most of what a kick is.
    The rig has had LeftToeBase/RightToeBase all along."""
    touched = 0
    for char in chars:
        data = pr.load(char)
        changed = False
        for pose in data["poses"].values():
            j = pose["j"]
            for side in ("L", "R"):
                if f"toe{side}" in j:
                    continue
                j[f"toe{side}"] = pr.default_toe(j[f"foot{side}"], j[f"knee{side}"])
                changed = True
        if changed:
            pr.dump(char, data)
            touched += 1
    print(f"toes: {touched} character file(s) updated")


def snap_toes(chars):
    """Pull derived toes onto the shoe. `default_toe` puts a toe a fixed step
    square to the shin, which is right for a foot that is flat and wrong for
    one that is pointed — and a toe floating beside the drawing is a handle
    nobody can see is wrong. Only toes are touched, and only ones that missed."""
    moved = 0
    for char in chars:
        data = pr.load(char)
        for key, pose in data["poses"].items():
            ink = None
            for name in ("toeL", "toeR"):
                x, y = pose["j"][name]
                if ink is None:
                    ink = pr.cell_mask(pr.open_frame(pr.manifest(), char, key))
                if not ink:
                    continue
                nx, ny, d = pr.nearest_ink(x, y, ink)
                if d > 1.5:
                    pose["j"][name] = [nx, ny]
                    moved += 1
        pr.dump(char, data)
        print(f"{char}: done")
    print(f"snap-toes: {moved} toe(s) pulled onto the art")


def swap(char, keys, part="all"):
    """Exchange left and right for named poses — the fix for a drawing whose
    near limb was read as the far one. `part` is all, arms or legs: a punch
    frame usually needs its ARMS exchanged and its legs left alone, because a
    body counter-rotates and the drawing is telling the truth about the legs."""
    pairs = {"all": pr.SIDED, "arms": pr.SIDED_ARMS, "legs": pr.SIDED_LEGS}[part]
    data = pr.load(char)
    for key in keys:
        pose = data["poses"].get(key)
        if not pose:
            raise SystemExit(f"{char} has no pose {key}")
        pose["j"] = pr.swap_sides(pose["j"], pairs)
        pose["source"] = "sides corrected against the art"
        pose.pop("seed", None)
    pr.dump(char, data)
    print(f"{char}: swapped sides on {len(keys)} pose(s)")


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    if argv[0] == "toes":
        add_toes(argv[1:] or pr.characters())
    elif argv[0] == "snap-toes":
        snap_toes(argv[1:] or pr.characters())
    elif argv[0] == "swap":
        part = "all"
        if argv[1] in ("arms", "legs", "all"):
            part, argv = argv[1], argv[1:]
        swap(argv[1], argv[2:], part)
    else:
        raise SystemExit(f"unknown migration {argv[0]}")


if __name__ == "__main__":
    main(sys.argv[1:])
