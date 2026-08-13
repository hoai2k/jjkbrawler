"""Cut a turnaround board into the separate views a multiview generator wants.

A DI board is four drawings side by side in ONE png: front, ¾, side, back.
Handing that whole png to a single-image generator does exactly what it says
on the tin — it models the PICTURE, and the picture is four people. Momo came
back as four Momo statues standing in a row, with three of them skinned onto
her hands, and the same happened to all five fighters in the round. The mesh
was never the problem; the seed was one image containing four figures.

So the board is cut here and the views are sent SEPARATELY, which is what the
multiview endpoint is for: same character, known camera, one body out.

WHICH PANEL IS WHICH. Tripo wants [front, left, back, right]. The board's
order is front, ¾, side, back — so panel 1 (the ¾) is DROPPED, because there
is no slot for it and feeding it as "left" would be a lie the generator would
faithfully model. The side panel shows the fighter facing screen-right; a
figure facing right presents their LEFT flank to the camera, so it goes in the
left slot. Getting that backwards builds a character inside-out.
"""

import argparse
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFERENCE = os.path.join(ROOT, "render3d", "docs", "reference")
#: Panel index on the board -> the multiview slot it fills. The ¾ view (1) is
#: absent by design; see the module docstring.
SLOTS = {0: "front", 2: "left", 3: "back"}


def trim(im, bg_tol=12):
    """Crop the drawing out of its white margin, keeping the panel square-ish.

    Panels are cut on even quarters, so a fighter drawn slightly off-centre
    carries a slab of white on one side. The generator reads that as space the
    body does not fill and shrinks the model into a corner of its own volume.
    """
    grey = im.convert("L")
    px = grey.load()
    w, h = grey.size
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] < 255 - bg_tol:
                xs.append(x)
                ys.append(y)
    if not xs:
        return im
    pad = max(4, min(w, h) // 50)
    return im.crop((max(0, min(xs) - pad), max(0, min(ys) - pad),
                    min(w, max(xs) + pad), min(h, max(ys) + pad)))


def slice_board(char, out_dir=None, panels=4, board=None):
    # A WEAPON PLATE IS A BOARD TOO. The DI5 prop plates draw the broom, the
    # axe, the polearm and the guitar four times each, exactly like a fighter
    # turnaround — so a plate sent whole produced four brooms, which is what
    # "her broom is divided into many pieces" turned out to mean.
    board = board or os.path.join(REFERENCE, f"{char}_turnaround.png")
    if not os.path.exists(board):
        raise SystemExit(f"no board at {board}")
    im = Image.open(board).convert("RGB")
    w, h = im.size
    step = w // panels
    out_dir = out_dir or os.path.join(REFERENCE, "_views")
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.basename(board).replace("_turnaround.png", "").replace(".png", "")
    written = {}
    for idx, slot in SLOTS.items():
        panel = trim(im.crop((idx * step, 0, (idx + 1) * step, h)))
        path = os.path.join(out_dir, f"{stem}_{slot}.png")
        panel.save(path)
        written[slot] = path
        print(f"  {slot:<6} panel {idx}  {panel.size[0]}x{panel.size[1]}  "
              f"{os.path.relpath(path, ROOT)}")
    return written


def main():
    ap = argparse.ArgumentParser(prog="slice_turnaround")
    ap.add_argument("char")
    ap.add_argument("--out")
    ap.add_argument("--board", help="an explicit board png; defaults to the fighter's turnaround")
    ap.add_argument("--panels", type=int, default=4)
    args = ap.parse_args()
    print(f"slicing {os.path.basename(args.board) if args.board else args.char + ' turnaround'}"
          f" into separate views:")
    slice_board(args.char, args.out, args.panels, args.board)


if __name__ == "__main__":
    main()
