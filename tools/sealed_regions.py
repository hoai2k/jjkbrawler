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
    """Every sealed candidate on one plate, with what the rules do with it."""
    rgba = np.asarray(Image.open(os.path.join(ROOT, src)).convert("RGBA"))
    if rgba[:, :, 3].min() < 250:
        return []                      # delivered with alpha; nothing was keyed
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
        return []
    luma = rgb.mean(axis=2)
    loc = ndimage.uniform_filter(luma, 5)
    var = ndimage.uniform_filter(luma * luma, 5) - loc * loc
    c = opaque & (np.linalg.norm(rgb - key, axis=2) < 14) & (var < 9)
    lab, n = ndimage.label(c, structure=np.ones((3, 3), np.int8))
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    big = np.isin(lab, np.nonzero(counts >= 250)[0])
    if not big.any():
        return []
    declined = intake.shading_on_pale(big, lab, luma, opaque)
    out = []
    h, w = lab.shape
    for i in np.unique(lab[big]):
        m = lab == i
        # The DEEPEST point rather than the centroid: a crescent's centroid can
        # sit outside it, and a verdict keyed by a point outside its own region
        # settles nothing.
        d = ndimage.distance_transform_edt(m)
        y, x = np.unravel_index(int(np.argmax(d)), d.shape)
        ys, xs = np.where(m)
        out.append({
            "x": int(x), "y": int(y), "px": int(m.sum()),
            "now": "kept" if declined[m].any() else "cut",
            "crop": [int(max(0, xs.min() - PAD)), int(max(0, ys.min() - PAD)),
                     int(min(w, xs.max() + PAD)), int(min(h, ys.max() + PAD))],
        })
    return out


def main():
    check = "--check" in sys.argv
    plan = json.load(sys.stdin)
    settled = intake.load_verdicts()
    rows, plates, answered = [], 0, 0
    for item in plan["active"]:
        ref = f"{item['char']}/{item['pose']}"
        found = regions_of(item["src"])
        if not found:
            continue
        plates += 1
        # A region a person has already answered is not a question any more.
        mine = settled.get(ref) or {}
        known = [tuple(p) for pts in mine.values() for p in pts]
        for r in found:
            x0, y0, x1, y1 = r["crop"]
            if any(x0 <= px < x1 and y0 <= py < y1 for px, py in known):
                answered += 1
                continue
            rows.append({"char": item["char"], "pose": item["pose"], "src": item["src"], **r})
    # Character first so a pass can be worked one fighter at a time, then the
    # biggest question on that fighter first.
    rows.sort(key=lambda r: (r["char"], -r["px"], r["pose"]))
    doc = {"_about": "Sealed regions on art the game draws, waiting to be judged. "
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
    print(f"{len(rows)} region(s) to judge across {chars} fighter(s) on {plates} plate(s); "
          f"{answered} already answered\n  -> {os.path.relpath(QUEUE, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
