#!/usr/bin/env python3
"""List the sprites flagged as needing art work.

The sprite workbench's **Sprite needs replacement** checkbox writes
`needsReplacement` onto a frame, meaning "the ART here is wrong" — as distinct
from its placement being wrong, which the other controls fix. Its value says
WHAT is wrong: a wholesale redraw and a crop fix are very different asks, and a
request that does not distinguish them is a request someone has to come back and
clarify. This collects the flags, grouped by that kind, so they can be turned
into asset requests.

The kinds are defined in src/sprites.js and parsed from there, so the set has
one source of truth rather than a copy here that can drift.

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
SPRITES_JS = os.path.join(HERE, "..", "src", "sprites.js")


def replacement_kinds():
    """`[key, label]` pairs out of REPLACEMENT_KINDS in src/sprites.js."""
    src = open(SPRITES_JS).read()
    block = src[src.index("export const REPLACEMENT_KINDS"):]
    block = block[:block.index("];")]
    return re.findall(r'\["(\w+)", "(.*?)"\]', block)

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

    kinds = dict(replacement_kinds())
    order = [k for k, _ in replacement_kinds()]

    rows = []
    for char in sorted(chars):
        for key, meta in sorted(chars[char].items()):
            flag = meta.get("needsReplacement")
            if not flag:
                continue
            # a legacy `true` predates the flag carrying a reason
            kind = "replace" if flag is True else str(flag)
            if kind not in kinds:
                print(f"  WARN {char}/{key}: unknown kind '{kind}', treating as replace")
                kind = "replace"
            states = sorted(s for s, fr in anims[char].items() if key in fr)
            rows.append({
                "character": char,
                "name": names.get(char, char),
                "frame": key,
                "file": meta.get("file", ""),
                "kind": kind,
                "kindLabel": kinds[kind],
                "states": states,
                "used": bool(states),
            })
    rows.sort(key=lambda r: (order.index(r["kind"]), r["character"], r["frame"]))

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    if not rows:
        print("no sprites flagged for replacement")
        return

    if args.markdown:
        print(f"{len(rows)} sprite(s) flagged\n")
        for kind in order:
            group = [r for r in rows if r["kind"] == kind]
            if not group:
                continue
            print(f"### {kinds[kind]}\n")
            print("| Character | Pose | Drives | File |")
            print("|---|---|---|---|")
            for r in group:
                drives = ", ".join(r["states"]) or "_unused_"
                print(f"| {r['name']} | `{r['frame']}` | {drives} | `{r['file']}` |")
            print()
        return

    print(f"{len(rows)} sprite(s) flagged")
    for kind in order:
        group = [r for r in rows if r["kind"] == kind]
        if not group:
            continue
        print(f"\n{kinds[kind]}  ({len(group)})")
        current = None
        for r in group:
            if r["character"] != current:
                current = r["character"]
                print(f"  {r['name']} ({current})")
            drives = ", ".join(r["states"]) or "not drawn by any animation"
            print(f"    {r['frame']:22} {drives}")


if __name__ == "__main__":
    main()
