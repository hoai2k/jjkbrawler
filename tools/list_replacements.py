#!/usr/bin/env python3
"""List the sprites flagged as needing new art.

The sprite workbench's **Sprite needs replacement** checkbox writes
`needsReplacement` onto a frame, meaning "the ART here is wrong, redraw it" —
as distinct from its placement being wrong, which the other controls fix. This
collects those flags so they can be turned into asset requests.

The flag is cleared automatically: `intake_import.py` rebuilds a frame's entry
when new art lands, which drops `needsReplacement` along with the rest of the
old settings. Flagging and importing are the two ends of one pipeline, so this
list is always "still outstanding", never a historical record.

Usage:
  python3 list_replacements.py              # grouped by character
  python3 list_replacements.py --markdown   # a table to paste into a request doc
  python3 list_replacements.py --json
"""

import argparse
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# Reuse the audit tool's source scanning so "which states draw this frame" has
# one implementation rather than two that can disagree.
from audit_frame_sizes import anims_by_frame  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    chars = man["characters"]
    src = open(CHARACTERS_JS).read()
    anims = anims_by_frame(src, list(chars))
    names = dict(re.findall(r'\n  ([a-z]+): \{\n(?:.*\n)*?    fullName: "(.+?)",', src))

    rows = []
    for char in sorted(chars):
        for key, meta in sorted(chars[char].items()):
            if not meta.get("needsReplacement"):
                continue
            states = sorted(s for s, fr in anims[char].items() if key in fr)
            rows.append({
                "character": char,
                "name": names.get(char, char),
                "frame": key,
                "file": meta.get("file", ""),
                "states": states,
                "used": bool(states),
            })

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    if not rows:
        print("no sprites flagged for replacement")
        return

    if args.markdown:
        print(f"{len(rows)} sprite(s) flagged for replacement\n")
        print("| Character | Pose | Drives | File |")
        print("|---|---|---|---|")
        for r in rows:
            drives = ", ".join(r["states"]) or "_unused_"
            print(f"| {r['name']} | `{r['frame']}` | {drives} | `{r['file']}` |")
        return

    print(f"{len(rows)} sprite(s) flagged for replacement")
    current = None
    for r in rows:
        if r["character"] != current:
            current = r["character"]
            print(f"\n  {r['name']} ({current})")
        drives = ", ".join(r["states"]) or "not drawn by any animation"
        print(f"    {r['frame']:22} {drives}")


if __name__ == "__main__":
    main()
