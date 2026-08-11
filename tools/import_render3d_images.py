#!/usr/bin/env python3
"""Import delivered DI images — the 3D track's 2D inputs — out of the intake.

These are not sprites. Nothing keys, trims, mirrors or measures them; they are
reference boards and small textures, and importing one is a copy to the place
the pipeline reads it from. What this tool is really for is the two things a
copy does not do:

  * **It knows where each round lands**, which was knowledge living only in the
    head of whoever moved yuji's five files by hand last round.
  * **It refuses a board that cannot do its job.** A turnaround is the seed a
    3D model is generated from, and a seed with the top of the head sliced off
    generates a model with the top of the head sliced off — on the very feature
    the plan says fails first (render3d/docs/plan.md §9). Twelve of the first
    twenty arrived that way. Landing them would have been worse than not: the
    request list is derived from which files EXIST, so a bad board that is
    present reads as a round complete.

Deliveries are found anywhere under assets/intake/, at any depth, so the batch
folders a delivery arrives in ("assets/intake/DI1/assets/intake/render3d/…")
need no flattening by hand.

    python3 tools/import_render3d_images.py            # what would happen
    python3 tools/import_render3d_images.py --apply    # do it
"""
import argparse
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
INTAKE = os.path.join(ROOT, "assets/intake")

sys.path.insert(0, HERE)

# suffix -> (round, destination directory)
ROUNDS = {
    "_turnaround.png": ("DI1", "render3d/docs/reference"),
    "_face.png":       ("DI2", "render3d/docs/reference"),
    "_shade.png":      ("DI3", "render3d/docs/reference"),
    "_mouth_sheet.png": ("DI4", "render3d/assets/textures"),
}

# Where a delivery is archived once imported, and where a refused one is kept.
ARCHIVE = "assets/reference/round21"
REFUSED = "assets/reference/round21/di1_cropped"

# A top-edge ink run at least this wide, in a single view, is a head running off
# the canvas rather than a blade tip or an antenna. Measured: heads cut across
# all four views ran 74-178 px; the widest innocent prop tip was 42 (Todo's
# topknot, whose face is entirely present).
HEAD_RUN = 60


def roster_keys():
    """Fighter keys, from the roster table the request docs share."""
    import re
    text = open(os.path.join(ROOT, "billboards/docs/asset-requests.md"), encoding="utf-8").read()
    text = text[text.index("## The roster"):]
    return {m.group(1) for m in re.finditer(r"^\|\s*`(\w+)`\s*\|", text, re.M)}


def head_cut(path):
    """Widest contiguous top-edge ink run in each of the board's four views."""
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return None  # cannot judge; treat as unknown rather than as passing
    a = np.asarray(Image.open(path).convert("RGB"))
    h, w, _ = a.shape
    ink = (a[:, :, 0] < 240) | (a[:, :, 1] < 240) | (a[:, :, 2] < 240)
    row = ink[0:2, :].any(axis=0)
    widest = 0
    for i in range(4):
        best = cur = 0
        for v in row[i * w // 4:(i + 1) * w // 4]:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        widest = max(widest, best)
    return widest


def deliveries():
    """Every DI image under the intake, at any depth."""
    out = []
    for base, _dirs, names in os.walk(INTAKE):
        for name in names:
            for suffix, (rnd, dest) in ROUNDS.items():
                if name.endswith(suffix):
                    out.append((os.path.join(base, name), name[: -len(suffix)], rnd, dest, name))
    return sorted(out, key=lambda r: (r[2], r[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually move files")
    args = ap.parse_args()

    keys = roster_keys()
    found = deliveries()
    if not found:
        print("nothing to import — no DI images under assets/intake/")
        return 0

    take, refuse = [], []
    for src, char, rnd, dest, name in found:
        if char not in keys:
            refuse.append((src, char, rnd, name, f"no fighter keyed `{char}`"))
            continue
        if rnd == "DI1":
            run = head_cut(src)
            if run is None:
                refuse.append((src, char, rnd, name, "cannot check the crop — Pillow/numpy missing"))
                continue
            if run >= HEAD_RUN:
                refuse.append((src, char, rnd, name, f"head runs off the top edge ({run}px)"))
                continue
        take.append((src, char, rnd, dest, name))

    by_round = {}
    for _s, _c, rnd, _d, _n in take:
        by_round[rnd] = by_round.get(rnd, 0) + 1
    print(f"{len(found)} delivered, {len(take)} to import, {len(refuse)} refused")
    for rnd in sorted(by_round):
        print(f"  {rnd}  {by_round[rnd]:>3}  -> {dict((r, d) for _s, _c, r, d, _n in take)[rnd]}/")
    if refuse:
        print("\nrefused:")
        for _src, char, rnd, _name, why in refuse:
            print(f"  {rnd} {char:12} {why}")

    if not args.apply:
        print("\ndry run — pass --apply to move them")
        return 0

    for src, char, rnd, dest, name in take:
        out = os.path.join(ROOT, dest, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.copy2(src, out)
        arch = os.path.join(ROOT, ARCHIVE, rnd, name)
        os.makedirs(os.path.dirname(arch), exist_ok=True)
        shutil.move(src, arch)
    for src, char, rnd, name, _why in refuse:
        out = os.path.join(ROOT, REFUSED, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.move(src, out)

    # Leave the intake as it was found: empty directories, and the batch
    # wrappers a delivery arrived in, are noise once their files have moved.
    for base, dirs, names in os.walk(INTAKE, topdown=False):
        if base == INTAKE:
            continue
        if not os.listdir(base):
            os.rmdir(base)

    print(f"\nimported {len(take)}, archived to {ARCHIVE}/")
    if refuse:
        print(f"refused {len(refuse)}, held at {REFUSED}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
