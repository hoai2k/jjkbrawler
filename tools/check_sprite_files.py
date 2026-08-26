#!/usr/bin/env python3
"""Every drawing the manifest names is on disk, and is a picture.

A zero-byte PNG shipped to `main` and nothing noticed. `hakari/dodge_air` was
imported correctly at 771,624 bytes and truncated to 0 two commits later — most
likely a `git checkout` killed mid-write while the working tree was large — and
from then on the pose drew NOTHING in the game. The manifest still named the
file, the file still existed, and every check passed: they all read the manifest
or the source, and none of them opened the art.

That is the gap this closes. It is cheap — the header of each file, not the
pixels — so it can sit in the gate:

  python3 tools/check_sprite_files.py
"""
import json
import os
import sys

from PIL import Image

import sprite_paths

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MANIFEST = sprite_paths.MANIFEST
# The manifest carries two kinds of path and they resolve from different roots:
# a character's poses from `sprites/assets/`, and the shared drawings — effects,
# summons — from `assets/sprites/`. CHAR_SPRITE_DIR and SHARED_SPRITE_DIR in
# src/assets.js, which is what the game reads them with.
ROOTS = (sprite_paths.CHAR, os.path.join(ROOT, "assets", "sprites"))


def named(man):
    """Every file path the manifest points at, with what points at it.

    The pose's own drawing, the one banked behind an approval hold, and every
    variant option — a hold showing an empty file is the same broken picture as
    a pose showing one, and the workbench draws both.
    """
    for char, poses in (man.get("characters") or {}).items():
        for key, meta in poses.items():
            if meta.get("file"):
                yield meta["file"], f"{char}/{key}"
            live = (meta.get("awaitingApproval") or {}).get("live") or {}
            if live.get("file"):
                yield live["file"], f"{char}/{key} (the drawing it is held against)"
    for char, poses in (man.get("variants") or {}).items():
        for key, entry in poses.items():
            for opt in entry.get("options") or []:
                if opt.get("file"):
                    yield opt["file"], f"{char}/{key} ({opt.get('label') or 'an alternate'})"


def main():
    man = json.load(open(MANIFEST))
    missing, empty, broken, seen = [], [], [], set()
    for rel, who in named(man):
        if rel in seen:
            continue
        seen.add(rel)
        path = next((os.path.join(r, rel) for r in ROOTS
                     if os.path.exists(os.path.join(r, rel))), None)
        if not path:
            missing.append((rel, who))
            continue
        if os.path.getsize(path) == 0:
            empty.append((rel, who))
            continue
        try:
            with Image.open(path) as im:
                im.verify()
        except Exception as err:
            broken.append((rel, who, str(err)[:60]))

    for rel, who in missing:
        print(f"FAIL {rel} is named by {who} and is not on disk")
    for rel, who in empty:
        print(f"FAIL {rel} is named by {who} and is EMPTY — the pose draws nothing")
    for rel, who, err in broken:
        print(f"FAIL {rel} is named by {who} and will not decode — {err}")
    bad = len(missing) + len(empty) + len(broken)
    if bad:
        print(f"\n{bad} of {len(seen)} drawing(s) the manifest names cannot be drawn")
        return 1
    print(f"every drawing the manifest names is on disk and decodes — {len(seen)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
