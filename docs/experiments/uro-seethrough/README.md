# Spike: Uro's garments keyed to alpha 0

The idea, from the anime: Uro's cloud garments are sometimes drawn keyed out, so
you see the background through them. This spike tests whether that can be a
render mode on the sprite backend as the art stands today.

Reproduce with:

    node tools/uro_seethrough_test.mjs --bg mist_pier --poses idle_a --modes hem

Each output is a side-by-side sheet: the pose as drawn, then the pose with the
garments keyed, both composited over a stage background.

## How the key works

Uro's cloud garments occupy a narrow cyan band in hue that nothing else on her
body uses (skin ~20-40°, hair ~270-300°, choker and bracelets brown). So:

1. **Seed** on saturated cyan pixels.
2. **Flood** into near-white neighbours, so the white cloud *interiors* come
   along but her eye whites and skin highlights — not connected to any cyan —
   do not.
3. **Filter by region.** Her cursed-energy palm FX is the same cyan as the
   cloth, so connected regions are kept only when they sit at torso height
   (18-72% down the body) and near the body's centre line. Without this the key
   eats her forearm on every palm-strike pose.
4. **Erode 3px** (`--modes hem`) so the garment's own dark outline survives at
   full alpha and the edge reads as a hem rather than a tear.

Modes: `cut` (alpha 0, no hem), `hem` (alpha 0, outline kept), `ghost:<a>`
(garment kept at alpha `a`, default 0.18). `--format jpeg` shrinks the sheets.

## What it looks like

| Sheet | Read |
| --- | --- |
| `uro_idle_a_cut.jpg` | Bands become raw holes. The silhouette tears — her shoulders detach where the cloud crossed the arm. |
| `uro_idle_a_hem.jpg` | The best case. Hem outline holds the shape; chest and hip bands are windows onto the pier. |
| `uro_victory_hem.jpg` | Best-reading of the set. Against `shibuya_night` the windows read as intentional. |
| `uro_*_ghost045.jpg` | Garment kept at alpha 0.45 — cloth stays legible, stage shows through, silhouette survives. |
| `uro_attack_heavy_a_hem.jpg` | Worst case. In an action pose the garment overlaps her arm and hip; keying it severs the limb and the torso becomes a floating gap between head and legs. |

## Verdict

Not shippable as a mode against the current sprite art, for one structural
reason: **there is no body drawn under the garments.** These are flat PNGs, so
alpha-0 on the garment pixels does not make cloth transparent — it punches a
hole through Uro. The anime look works because the figure stays whole and only
the cloth is a window; here the cloth *is* the figure in that region.

Two things would fix it, neither of them a code change:

- **Two-layer art.** A body layer and a garment layer per pose, so the garment
  layer's alpha can be driven independently and the body underneath still
  renders. That is a redraw of all 48 Uro frames, and it also raises the
  question of what the body layer shows — worth deciding before anyone draws.
- **A garment mask channel.** Cheaper: ship a per-frame mask marking garment
  pixels, so the key needs no colour heuristic. It fixes the *precision*
  problem (the severed forearm) but not the hole problem.

What does work today, and would be about ten lines in the sprite backend, is
`ghost` at a low alpha — the garments stay legible as cloth while the stage
shows through them. That reads as a stylistic effect rather than damage. If a
"sky-clad" mode is wanted for Uro without new art, that is the version to build.
