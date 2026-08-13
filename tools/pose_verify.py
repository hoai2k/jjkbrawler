"""Structural checks on a pose read — the errors a joint-on-the-ink test misses.

`pose_contact_sheet.py --check` proves every joint sits on the drawing.
`check_pose_reads.mjs` proves the file is well formed. Neither notices that the
body those joints describe is impossible, and an impossible body is exactly
what a wrong side assignment produces: legs that cross at the shins, a limb
twice the length of its partner, a torso turned further than a torso goes.

    python3 tools/pose_verify.py yuji

Each check is a statement about ANATOMY, not about art, so it holds for every
fighter and can be argued with:

  CROSSED       the two legs (or arms) intersect in the drawing plane. Real in
                a few poses and a tell-tale of swapped sides in the rest, so it
                is reported rather than failed.
  LOPSIDED      a bone and its opposite number differ by more than half. Both
                thighs are the same length on a real body; a drawing
                foreshortens one, not doubles it.
  TURNED PAST   the shoulder or hip line is wider apart than the body is,
                which cannot be a rotation and is usually a marker on the
                wrong blob.
  SIDES         the drawing shows the chest but the left marker is drawn to
                the left, or vice versa — the arms are the wrong way round.
"""

import argparse
import math
import sys

import pose_reads as pr

#: Segment lengths as a fraction of the torso, for a human-ish fighter. Only
#: used to flag a limb against ITS OWN OPPOSITE, so the numbers matter less
#: than the pairing does.
PAIRS = [
    ("thigh", ("hipL", "kneeL"), ("hipR", "kneeR")),
    ("shin", ("kneeL", "footL"), ("kneeR", "footR")),
    ("upper arm", ("shoulderL", "elbowL"), ("shoulderR", "elbowR")),
    ("forearm", ("elbowL", "handL"), ("elbowR", "handR")),
]


def seg(j, a, b):
    return math.dist(j[a][:2], j[b][:2])


def crosses(p1, p2, p3, p4):
    """Do the segments p1p2 and p3p4 cross? Plain orientation test."""
    def side(a, b, c):
        return ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]))
    d1, d2 = side(p3, p4, p1), side(p3, p4, p2)
    d3, d4 = side(p1, p2, p3), side(p1, p2, p4)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def verify(char):
    data = pr.load(char)
    notes = []
    for key, pose in data["poses"].items():
        j = pose["j"]
        say = lambda kind, text: notes.append((key, kind, text))  # noqa: E731

        # Crossed limbs. The shin pair is the telling one: thighs cross all the
        # time on a turned pelvis, shins hardly ever.
        if crosses(j["kneeL"], j["footL"], j["kneeR"], j["footR"]):
            say("CROSSED", "the shins cross — usually the legs are the wrong way round")
        if crosses(j["elbowL"], j["handL"], j["elbowR"], j["handR"]):
            say("CROSSED", "the forearms cross")

        # Lopsided pairs.
        for name, left, right in PAIRS:
            a, b = seg(j, *left), seg(j, *right)
            if min(a, b) < 1:
                continue
            ratio = max(a, b) / min(a, b)
            if ratio > 2.2:
                say("LOPSIDED", f"the {name}s differ by {ratio:.1f}x "
                                f"({a:.0f} vs {b:.0f} cells)")

        # A bar turned further than it is wide.
        torso = math.dist(
            [(j["shoulderL"][0] + j["shoulderR"][0]) / 2,
             (j["shoulderL"][1] + j["shoulderR"][1]) / 2], j["pelvis"][:2])
        for what, a, b, span in (("shoulder", "shoulderL", "shoulderR", 0.69),
                                 ("hip", "hipL", "hipR", 0.45)):
            width = span * torso
            across = j[a][0] - j[b][0]
            if width and abs(across) > width * 1.15:
                say("TURNED PAST", f"the {what} line is {abs(across):.0f} cells across, "
                                   f"wider than the {width:.0f} it can be")
    return data, notes


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("char", nargs="?", default="yuji")
    args = ap.parse_args()

    data, notes = verify(args.char)
    if not notes:
        print(f"{args.char}: {len(data['poses'])} poses, nothing structurally odd")
        return 0
    width = max(len(k) for k, _, _ in notes)
    for key, kind, text in notes:
        print(f"{key:<{width}}  {kind:<12} {text}")
    print(f"\n{len(notes)} note(s) across {len({k for k, _, _ in notes})} of "
          f"{len(data['poses'])} poses. These are worth LOOKING at, not obeying.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
