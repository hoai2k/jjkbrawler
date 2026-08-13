"""Take a pose editor export and put it back in the tree.

The editor (`render3d/workbench/?edit=pose`) downloads either one character's
whole read — `yuji.json` — or every character edited in that session as one
`pose-reads-edited.json`. Both are the same shape; this accepts either, checks
it, and rewrites the affected files in the canonical format so the diff is a
diff of joints and not of whitespace.

    python3 tools/pose_apply.py ~/Downloads/yuji.json
    python3 tools/pose_apply.py ~/Downloads/pose-reads-edited.json

It refuses a file that is missing joints, names a frame the character does not
have, or carries a coordinate outside the cell — a bad read is worth catching
here, where the fix is to re-export, rather than three steps downstream where
it looks like a rig bug.
"""

import argparse
import json
import sys

import pose_reads as pr


def check(man, char, poses):
    known = set(pr.frames(man, char))
    problems = []
    for key, pose in poses.items():
        if key not in known:
            problems.append(f"{char}/{key}: no such frame")
            continue
        # Toes are derivable from the foot and knee, so a file written before
        # they existed still applies — everything else has to be there.
        missing = [j for j in pr.JOINTS
                   if j not in pose.get("j", {}) and not j.startswith("toe")]
        if missing:
            problems.append(f"{char}/{key}: missing {', '.join(missing)}")
        for joint, xy in pose.get("j", {}).items():
            if joint not in pr.JOINTS:
                problems.append(f"{char}/{key}: unknown joint {joint}")
            elif not (2 <= len(xy) <= 3 and all(0 <= float(v) <= 100 for v in xy[:2])):
                problems.append(f"{char}/{key}.{joint}: {xy} is outside the cell")
            elif abs(pr.depth(xy)) > pr.DEPTH_LIMIT:
                problems.append(f"{char}/{key}.{joint}: depth {xy[2]} is past the cell")
    return problems


def apply_one(man, char, incoming):
    """Merge one character's export over what is on disk, keeping poses the
    export does not mention (an export always carries the whole character, but
    a hand-trimmed one should not silently delete the rest)."""
    try:
        data = pr.load(char)
    except FileNotFoundError:
        data = {"character": char, "facing": "right", "_joints": pr.JOINTS, "poses": {}}
    if incoming.get("_about"):
        data["_about"] = incoming["_about"]
    edited, kept = 0, []
    for key, pose in incoming["poses"].items():
        held = data["poses"].setdefault(key, {})
        # An export carries the WHOLE character, including poses the session
        # never touched — so an older download re-applied later would quietly
        # undo every correction made since. A pose that is hand-placed on disk
        # and untouched in the payload keeps what disk has.
        if held.get("source") and not pose.get("source"):
            kept.append(key)
            continue
        j = dict(pose["j"])
        for side in ("L", "R"):
            j.setdefault(f"toe{side}", pr.default_toe(j[f"foot{side}"], j[f"knee{side}"]))
        held["j"] = {name: [round(float(v), 1) for v in j[name][:3]] for name in pr.JOINTS}
        if pose.get("read"):
            held["read"] = pose["read"]
        if pose.get("flags"):
            held["flags"] = pose["flags"]
        if pose.get("source"):
            held["source"] = pose["source"]
            held.pop("seed", None)
            edited += 1
        elif pose.get("seed"):
            held["seed"] = pose["seed"]
    # Frames keep the manifest's order, so a re-export never reshuffles the file.
    order = [k for k in pr.frames(man, char) if k in data["poses"]]
    data["poses"] = {k: data["poses"][k] for k in order}
    # The seed stamp on the file as a whole stops being true once a human has
    # been through it.
    if edited and data.get("_seed"):
        data.pop("_seed")
    pr.dump(char, data)
    return len(incoming["poses"]) - len(kept), edited, kept


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("payload", help="a character export, or an all-edited export")
    args = ap.parse_args()

    with open(args.payload) as fh:
        blob = json.load(fh)
    # One character exports as {character, poses}; "all edited" exports as
    # {char: {character, poses}}.
    chars = {blob["character"]: blob} if "poses" in blob else blob

    man = pr.manifest()
    problems = []
    for char, data in chars.items():
        if char not in man["characters"]:
            problems.append(f"{char}: not a character in the sprite manifest")
            continue
        problems += check(man, char, data["poses"])
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return f"{len(problems)} problem(s); nothing written"

    for char, data in chars.items():
        total, edited, kept = apply_one(man, char, data)
        print(f"{char}: {total} poses written, {edited} marked hand-placed")
        if kept:
            print(f"  kept on disk (hand-placed here, untouched in the payload): "
                  f"{', '.join(sorted(kept))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
