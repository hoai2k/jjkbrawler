#!/usr/bin/env python3
"""Find the sealed regions a person still has to judge, and write the queue.

Fed the active poses by `build_sealed_queue.mjs` on stdin — only that half can
say what the game draws. This half does the pixels: for each delivered original,
the regions `intake.flat_key_mask` has to decide about, minus the ones somebody
has already answered in `sealed_verdicts.json`.

Each row is one region:

    char, pose, src      the fighter, the pose, the delivered plate
    x, y                 a point inside the region, in the plate's own pixels —
                         the same coordinate a verdict is keyed by, chosen as
                         the deepest point so it survives a wobble in the mask
    px                   how big it is
    now                  what the rules do with it today: "cut" or "kept"
    crop                 the box the bench draws, region plus margin
    box, rle             the region ITSELF: its own bounding box, and its pixels
                         as run lengths across that box starting with "outside"

`rle` is here because the first version had the bench find the region again by
flooding the screen colour out from the seed, which was wrong twice. It read the
key from the plate's top-left corner, so Dagon's magenta screen — whose corner
differs from the patch by more than the tolerance — highlighted nothing at all;
and even with the key right, a flood with no variance test and no silhouette to
stop it ran 36% past the real region. The bench is asking somebody to judge one
patch, so it has to outline that patch and not approximately that patch. Run
lengths over the region's own box cost about 200 bytes each.

`--check` says whether the queue on disk is current without writing.
"""
import intake
import sprite_paths

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
QUEUE = os.path.join(os.path.dirname(sprite_paths.MANIFEST), "sealed_queue.json")
PAD = 130


def regions_of(src):
    """Every sealed candidate on one plate, and a way to look one up by point.

    Returns `(rows, at)`. `at((x, y))` gives the index of the region that
    CONTAINS that point, or None — the same test `intake.settled` applies when
    it carries a verdict out, and matching it here is the whole point: a region
    may only be taken off the queue if the keyer will actually act on the answer.
    """
    rgba = np.asarray(Image.open(os.path.join(ROOT, src)).convert("RGBA"))
    if rgba[:, :, 3].min() < 250:
        return [], lambda pt: None     # delivered with alpha; nothing was keyed
    rgb = rgba[:, :, :3].astype(np.float32)
    key = intake.border_key(rgb)
    cand = np.linalg.norm(rgb - key, axis=2) < 30
    seed = np.zeros(cand.shape, bool)
    seed[[0, -1], :] = cand[[0, -1], :]
    seed[:, [0, -1]] |= cand[:, [0, -1]]
    bg = intake.flood_background(cand, seed)
    alpha = (~bg).astype(np.float32)
    alpha[alpha >= 48 / 255] = 1.0
    opaque = alpha > 0
    if opaque.sum() < 1000:
        return [], lambda pt: None
    luma = rgb.mean(axis=2)
    loc = ndimage.uniform_filter(luma, 5)
    var = ndimage.uniform_filter(luma * luma, 5) - loc * loc
    c = opaque & (np.linalg.norm(rgb - key, axis=2) < 14) & (var < 9)
    lab, n = ndimage.label(c, structure=np.ones((3, 3), np.int8))
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    big = np.isin(lab, np.nonzero(counts >= 250)[0])
    if not big.any():
        return [], lambda pt: None
    declined = intake.shading_on_pale(big, lab, luma, opaque)
    out = []
    where = {}
    h, w = lab.shape
    for i in np.unique(lab[big]):
        where[int(i)] = len(out)
        m = lab == i
        # The DEEPEST point rather than the centroid: a crescent's centroid can
        # sit outside it, and a verdict keyed by a point outside its own region
        # settles nothing.
        d = ndimage.distance_transform_edt(m)
        y, x = np.unravel_index(int(np.argmax(d)), d.shape)
        ys, xs = np.where(m)
        bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        flat = m[by0:by1, bx0:bx1].ravel()
        # Run lengths, first run being the pixels NOT in the region, so the
        # decoder can alternate without a per-run flag.
        edges = np.flatnonzero(np.diff(flat)) + 1
        runs = np.diff(np.concatenate(([0], edges, [flat.size])))
        if flat[0]:
            runs = np.concatenate(([0], runs))
        out.append({
            "x": int(x), "y": int(y), "px": int(m.sum()),
            "now": "kept" if declined[m].any() else "cut",
            "crop": [int(max(0, bx0 - PAD)), int(max(0, by0 - PAD)),
                     int(min(w, bx1 + PAD)), int(min(h, by1 + PAD))],
            "box": [bx0, by0, bx1, by1],
            "rle": [int(v) for v in runs],
        })

    def at(point):
        x, y = int(point[0]), int(point[1])
        if not (0 <= y < h and 0 <= x < w) or not big[y, x]:
            return None
        return where.get(int(lab[y, x]))

    return out, at


def main():
    check = "--check" in sys.argv
    plan = json.load(sys.stdin)
    settled = intake.load_verdicts()
    rows, plates, answered = [], 0, 0
    # Verdicts whose point lands in no region at all: the plate re-keyed, or the
    # keyer changed under an answer. They are not lost — the store keeps them —
    # but they are doing nothing, so say so.
    stray = 0
    for item in plan["active"]:
        ref = f"{item['char']}/{item['pose']}"
        found, at = regions_of(item["src"])
        if not found:
            continue
        plates += 1
        # SETTLED MEANS SETTLED, AND MIXED DOES NOT.
        #
        # `background` and `figure` are instructions the keyer can carry out, so
        # the patch stops being a question. `mixed` and `other` are the reviewer
        # saying the question is the wrong one — part gap and part shadow, or a
        # ghost image that no key can fix — and those come back, carrying the
        # mark, because they are work somebody still means to do.
        #
        # A VERDICT ANSWERS THE REGION IT LANDS IN AND NO OTHER. This used to
        # test the point against the region's `crop` — the window the bench
        # DRAWS, which is the patch plus 130px of margin all round — and on a
        # crowded plate that margin covers the neighbours: 764 of 2,420 sibling
        # pairs had one region's seed inside another's crop. So one answer took
        # its neighbours off the queue as well, and they were never fixed,
        # because `intake.settled` carries a verdict out by the region that
        # CONTAINS the point. A patch the keyer will not act on must not be
        # treated as decided, so the test here is now that same containment.
        mine = settled.get(ref) or {}
        done = [tuple(p) for k in ("background", "figure") for p in mine.get(k, [])]
        open_marks = {tuple(p): k for k in ("mixed", "other") for p in mine.get(k, [])}
        # A split is an answer AND a drawing, and the drawing has to come back
        # with it: reopening the window on a patch that was already split should
        # start from the loops that are there, not from a blank canvas.
        splits = {tuple(e["at"]): e["shadow"] for e in mine.get("split", [])}
        answers, marks, drawn = {}, {}, {}
        for pt in done:
            i = at(pt)
            if i is None:
                stray += 1
            else:
                answers[i] = True
        for pt, kind in open_marks.items():
            i = at(pt)
            if i is None:
                stray += 1
            else:
                marks[i] = kind
        for pt, loops in splits.items():
            i = at(pt)
            if i is None:
                stray += 1
            else:
                drawn[i] = loops
        for n, r in enumerate(found):
            if n in answers:
                answered += 1
                continue
            loops, mark = drawn.get(n), marks.get(n)
            rows.append({"char": item["char"], "pose": item["pose"], "src": item["src"],
                         "band": "flagged" if (mark or loops) else item.get("band", "drawn"),
                         **({"mark": mark} if mark else {}),
                         **({"loops": loops} if loops else {}), **r})
    # Band first — what somebody is actively trying to solve, then what is
    # waiting to be approved, then what is on screen, then the rest. Character
    # next, so a pass can be worked one costume at a time, then the biggest
    # question on that fighter.
    order = {"flagged": 0, "held": 1, "drawn": 2, "other": 3}
    rows.sort(key=lambda r: (order.get(r["band"], 2), r["char"], -r["px"], r["pose"]))
    doc = {"_about": "Sealed regions waiting to be judged, in bands: flagged for "
                     "improvement, held for approval, drawn by the game, then the rest. "
                     "Built by tools/build_sealed_queue.mjs; answered in "
                     "workbench/?edit=verification.",
           "regions": rows}
    body = json.dumps(doc, indent=1) + "\n"
    if check:
        current = open(QUEUE).read() if os.path.exists(QUEUE) else ""
        if current == body:
            print(f"queue is current — {len(rows)} region(s) waiting")
            return 0
        print(f"queue is stale — rebuild with: node tools/build_sealed_queue.mjs")
        return 1
    open(QUEUE, "w").write(body)
    chars = len({r["char"] for r in rows})
    tally = {b: sum(1 for r in rows if r["band"] == b)
             for b in ("flagged", "held", "drawn", "other")}
    print(f"{len(rows)} region(s) to judge across {chars} fighter(s) on {plates} plate(s); "
          f"{answered} already answered\n  "
          f"{tally['flagged']} on art flagged for improvement, {tally['held']} on held art, "
          f"{tally['drawn']} on art the game draws, {tally['other']} on the rest"
          + (f"\n  {stray} verdict(s) land in no region on their plate — nothing "
             f"acts on those" if stray else "")
          + f"\n  -> {os.path.relpath(QUEUE, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
