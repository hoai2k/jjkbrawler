"""WHICH DRAWING A SHARED SPRITE'S TUNING WAS MEASURED AGAINST.

A character pose can tell that its art has been replaced, because a replacement
lands under a NEW filename and the manifest's `file` changes with it — that is
what lets intake_import.py roll the hand tuning back (`pristine`), on the
reading that a nudge made to compensate for a bad drawing must not be inherited
by the drawing that fixes it.

A shared drawing has no such handle. `effect:blood_orb` resolves to
`effects/blood_orb.png` by construction and always will; a redelivery overwrites
those bytes in place, prep_effects.py rewrites them again, and nothing anywhere
notices that the dx of -57.1 beside it was chosen for a picture that is gone.
The numbers are silently inherited by art they were never measured against.

So the identity is the CONTENT. An entry records the file it was tuned against
and a hash of that file's bytes; when the two stop agreeing, the tuning is
stale and `pristine()` applies exactly as it does for a pose.

    "effect:blood_orb": {
      "dx": -0.2, "dy": -1.4,
      "edited": { "dx": null, "dy": null },
      "src": { "file": "assets/sprites/effects/blood_orb.png", "sha": "9f86d0…" }
    }

Hashing rather than a delivery hook because effect art arrives by hand — the
route is a documented `cp` into assets/sprites/ (assets/intake/README.md) — so
there is no import event to hang a reset on. A hash notices however it arrived.
"""

import hashlib
import os

import sprite_paths

#: How much of the digest is kept. Full SHA-256 in a file a human reads is
#: noise; 12 hex chars is 48 bits, which is far more than enough to tell two
#: versions of one drawing apart and short enough to skim past.
DIGEST_CHARS = 12


def digest(path):
    """The stamp for a file's current bytes, or None when it is not there.

    Missing is not an error: an entry can name art that has been retired, and
    a checker should say so rather than crash.
    """
    if not os.path.isfile(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:DIGEST_CHARS]


def abspath(file):
    """A repo-relative path from the manifest, made absolute."""
    return os.path.join(sprite_paths.ROOT, file)


def stamp(entry, file):
    """Record `file` and its current bytes on a shared-sprite entry."""
    sha = digest(abspath(file))
    if sha is None:
        return False
    entry["src"] = {"file": file, "sha": sha}
    return True


def stale(entry):
    """Is this entry tuned against a drawing that is no longer there?

    Three answers, and only one of them is "reset it":

      None    nothing to say — no stamp (nobody has tuned it since stamping
              existed, so there is no claim to be wrong), or no tuning at all.
      False   the stamp matches the bytes. The numbers describe this picture.
      True    the bytes have changed under the numbers.

    An entry whose file has gone MISSING is not stale — it is broken, and
    silently rolling its numbers back would destroy work over what is much more
    likely a bad path than a redelivery. Reported separately.
    """
    src = entry.get("src")
    if not isinstance(src, dict) or not src.get("file") or not src.get("sha"):
        return None
    now = digest(abspath(src["file"]))
    if now is None:
        return None
    return now != src["sha"]


def missing(entry):
    """Named a file that is not on disk."""
    src = entry.get("src")
    return bool(isinstance(src, dict) and src.get("file")
                and digest(abspath(src["file"])) is None)


def pristine(entry):
    """`entry` with hand tuning rolled back to what the pipeline generated.

    The same rule intake_import.py applies to a redrawn character pose, and
    deliberately the same code shape: `edited` maps each hand-tuned field to
    what it held before the first edit, so `None` means the field was absent
    and anything else is the value to restore. Review flags and the stamp go
    too — "fix the alpha" was said about the old drawing.
    """
    out = dict(entry)
    for field, value in (entry.get("edited") or {}).items():
        if value is None:
            out.pop(field, None)
        else:
            out[field] = value
    out.pop("edited", None)
    out.pop("src", None)
    for flag in ("needsReplacement", "wantsImprovement",
                 "replacementNote", "improvementNote"):
        out.pop(flag, None)
    return out
