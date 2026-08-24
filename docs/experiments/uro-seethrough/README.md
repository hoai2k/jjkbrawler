# Uro's garments keyed to alpha 0

The idea, from the anime: Uro's cloud garments are sometimes drawn keyed out, so
you see the background through them. This started as a spike asking whether that
could be a render mode. It shipped as one — Settings → **Clothing FX**, off by
default — and this is the record of what was tried and what it looks like.

    node tools/uro_seethrough_test.mjs --poses idle_a          # one pose, before and after
    node tools/uro_seethrough_test.mjs --contact               # every pose, keyed, over a stage
    node tools/bench_clothing_fx.mjs                           # what the pass costs
    node tools/check_clothing_fx.mjs                           # the drift guard (in `npm run check`)

Everything here renders through `src/clothing_fx.js`, the module the game draws
with, so no sheet in this directory can drift from what a player sees.

## How the key works

Uro's cloud garments occupy a narrow cyan band in hue that nothing else on her
body uses (skin ~20-40°, hair ~270-300°, choker and bracelets brown). So:

1. **Seed** on saturated cyan pixels.
2. **Flood** into near-white neighbours, so the white cloud *interiors* come
   along but her eye whites and skin highlights — connected to no cyan — do not.
3. **Filter by region.** Her cursed-energy palm FX is the same cyan as the
   cloth, so connected regions are kept only when they sit at torso height and
   straddle the body's centre line. Without this the key eats her forearm on
   every palm-strike pose.
4. **Erode 3px**, so the garment's own dark outline survives at full alpha and
   the edge reads as a hem rather than a tear.

The mask is worked out at half resolution. Her frames are drawn ~1400px tall and
reach the screen about 210px tall, so the art carries around 7× the detail the
effect can ever show; halving it is invisible and costs a quarter as much
(3.0s → 1.0s for her whole set).

## What it looks like

| Sheet | Read |
| --- | --- |
| `contact_1..3.jpg` | All 47 poses as the game draws them with the effect on. This is the sheet the drift guard means when it says to look before blessing. |
| `uro_idle_a_cut.jpg` | Alpha 0 with no hem. The silhouette tears — her shoulders detach where the cloud crossed the arm. The reason the erode exists. |
| `uro_idle_a_hem.jpg` | The shipped look. Hem outline holds the shape; chest and hip bands are windows onto the pier. |
| `uro_victory_hem.jpg` | Best-reading of the set. Against `shibuya_night` the windows read as intentional. |
| `uro_*_ghost045.jpg` | The alternative: garment kept at alpha 0.45 rather than removed. Cloth stays legible, stage shows through, silhouette never breaks. Not what shipped, and one `alpha` in the profile away. |
| `uro_attack_heavy_a_hem.jpg` | The pose that drove the region filter. Before it, the key took her forearm along with her clothes. |

## What alpha 0 cannot do, and why it ships anyway

The sprites are flat drawings — there is no body layer under the garment — so
this does not make cloth *translucent*, only absent. Where the cloth is, the
figure simply stops, and on some poses that is most of her torso. On Uro it
reads, because her outfit is cloud and cloud thinning into sky is the character.
On a fighter in a jacket it would read as a hole, which is why the profile table
in `clothing_fx.js` has one entry rather than a rule for the roster.

One pose is past what it can carry. `prone` is drawn in a full-length gown
rather than the two bands, and keying it leaves a head, one arm and a wisp of
hem — she is not on screen any more. It is in the profile's `skip` list.

A true see-through-cloth mode would need two-layer art: a body layer and a
garment layer per pose, so the garment's alpha could move independently. That is
a redraw of all 47 frames and a decision about what the body layer shows — an
art question, not a code one.

## Where the hook has to live

The effect keys sprite art, and sprite art reaches the screen through **two**
paths: `sprites/src/sprites.js drawCharFrame` (the flat blit) and
`src/camera3d/billboards.js drawChar` (the 2.5D camera's sprite card, which
replays the same transform chain as a matrix rather than calling
drawCharFrame). The 2.5D camera is on by default, so the second is the one a
player sees.

This shipped hooked to the first one only. The settings toggle worked, the pass
returned a keyed canvas, the arena bench rendered it correctly — and the effect
was invisible in every real match, because the bench draws flat and the game
does not. `tools/smoke_clothing_fx.mjs` now plays a real match and asserts on
the framebuffer, which is the only check that could have caught it.

## Keeping the key and the art in step

The key reads her art by colour, and nothing in the sprite pipeline knows that.
`sprites/assets/clothing_fx.json` pins each frame's hash to what the key takes
out of it, and `tools/check_clothing_fx.mjs` — in `npm run check`, pure node —
fails when either moves. The full note is in
[sprites/docs/asset-pipeline.md](../../../sprites/docs/asset-pipeline.md).
