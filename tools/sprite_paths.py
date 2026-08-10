"""Where sprite art lives, for the tools that read and write it.

The art used to sit in one tree, `sprites/assets/`, holding two unrelated
things: the fighters' own sheets, and the shared drawings that belong to no
fighter (effects, summon creatures). Those have different owners, different
delivery rounds and — since the 2.5D work — different futures, because a model
backend replaces the fighters and leaves the effects exactly where they are.
So they were split:

    sprites/assets/     CHAR      every fighter's own sheets, plus the manifest
                                  that indexes them. Includes Mahoraga, who is
                                  a summon in the fiction but is ANIMATED like
                                  a character, out of a character sprite set.
                                  Also each fighter's archive/, alt/ and
                                  incoming/ backups, which travel with them.

    sprites/assets/     SHARED    effects/ and summons/ — art the renderer
                                  spawns, not art a fighter is drawn from.

The manifest's `file` fields are relative to CHAR, so `os.path.join(CHAR,
meta["file"])` is how a tool opens a fighter's frame. Nothing in the manifest
points into SHARED.

Import these rather than rebuilding the paths, so the next move is one edit:

    from sprite_paths import CHAR, MANIFEST
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

#: Character sprite sheets and the manifest that indexes them.
CHAR = os.path.join(ROOT, "sprites", "assets")

#: Art belonging to no single fighter: effects/ and summons/.
SHARED = os.path.join(ROOT, "assets", "sprites")

#: The sprite manifest — the index naming the file each pose draws from.
MANIFEST = os.path.join(CHAR, "manifest.json")

#: Shared subtrees, named so a tool does not have to spell the split out again.
EFFECTS = os.path.join(SHARED, "effects")
SUMMONS = os.path.join(SHARED, "summons")
