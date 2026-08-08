# Sprite fix records

Before/after evidence for repairs made directly to delivered sprite art, as
opposed to the placement changes the workbench writes into `manifest.json`.

A repair belongs here when it edits **pixels**. It is worth a record because the
art is not regenerable — there is no source file behind these PNGs — so the only
account of what changed is the diff and a picture of it.

| Sheet | Frame | Fix |
|---|---|---|
| `nobara-r2c2-alpha.png` | `nobara/r2c2` (down heavy) | An opaque white patch of the original background, 853 px, enclosed between her sleeve, thigh and shoe, made transparent. Bounds, `w`/`h`/`ox`/`oy` and anchors are unchanged; the centroid moves 0.7 px. |

## Not fixed: the seven `crop` flags

`crop-flagged-diagnosis.png` is a diagnosis, not a repair. It marks in red every
opaque pixel sitting on the image border across the seven cells flagged **Fix
crop** — art the extraction cut through. Those pixels exist nowhere in the repo
or its git history, so no edit recovers them. They are commissioned instead, in
Round 10B of `docs/asset-requests.md`.
