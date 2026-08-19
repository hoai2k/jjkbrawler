# Character heights — how big each fighter is drawn

## The problem

Every fighter's rendered size used to be a hand-set `scale` in `characters.js`,
sitting at 0.57-0.60 for the whole roster with no relation to anything. Gojo,
canonically the tallest sorcerer alive at 190 cm, was drawn **third smallest**.
Momo, who is tiny, was drawn taller than him. The sprite workbench's head-height
target was a measurement of whatever size the art happened to be — and for the
six most recent fighters it was missing entirely, so the control read `0`.

Size now comes from canon height.

## The chain

```
heightCm            characters.js   the real figure in cm, or null if unpublished
  -> heightRatio()  heights.js      measured against Gojo, then clamped
  -> headHeightTarget()             rendered head height, in game pixels
  -> CHARACTERS[key].scale          what drawCharFrame is handed
```

`scale` is **derived**. The literals still in `characters.js` are a pre-load
fallback only — editing them does nothing. Change `heightCm`, or override the
target in the workbench.

The target names **the top of the head**, and it is met exactly: the scale is
solved against `bodyTop`, the topmost opaque row of the idle art measured
offline by `tools/bake_anchors.py`. Measured across the roster, every idle's
painted top lands within 0.6 game pixels of its bar.

Because the idle's foot line is part of that span, moving the idle's **ground
contact** re-solves the scale and the head stays where it was — the sprite grows
or shrinks downward from a fixed head position rather than sliding off the bar.
The same applies to the idle's size control. Neither is true of any other pose:
only the idle drives the character's size.

Solving happens in `loadCoreAssets()`, because it needs the manifest's body
measurements — and it is in the *core* load, before any sprite has been
fetched, so a fighter is already the right size the first time they are drawn
however late their art arrives. The game and both workbenches all go through it,
so they cannot disagree about how tall a fighter is.

## How far apart the extremes are drawn

Heights used to be **compressed**: `HEIGHT_COMPRESSION` sat at 0.6, pulling the
roster toward the middle because hurtboxes were one size for everyone
(`hurtbox()` in `combat.js`) and a fighter drawn much larger or smaller than
their box read as hitting, or being hit, through thin air.

That constraint is gone. Hurtboxes are now measured from each fighter's own art
(`src/silhouette.js`), so a taller fighter is a bigger target — which is what
being taller should mean. `HEIGHT_COMPRESSION` is **1.0**: the roster renders at
true relative scale.

`HEIGHT_MIN_RATIO` (0.84) and `HEIGHT_MAX_RATIO` (1.14) are now the real spread
control. True scale spans 1.47x across the roster, which is wider than the
stages' platform gaps and jump arcs are built for; the clamps hold it to 1.36x
with the ordering intact. Two fighters currently sit on a clamp — **Momo** at the
floor (150 cm would render at 0.789) and **Hanami** at the ceiling (220 cm would
render at 1.158). Everyone else is at their true ratio.

`HEIGHT_BASE_PX` (149) is what a fighter at ratio 1.0 renders at. It was 175.3 —
chosen so the roster's *average* drawn height was unchanged from before heights
were canon — until the level-design pass ([level-design-review.md](level-design-review.md),
G1) shrank the roster ~15%: at the old size no fighter could jump their own
height and boards had no room for Smash-style spacing. The dynamic camera
(`camera.js`) zooms in on close fights so fighters still read large.

All four dials are in `src/config_tuning.js`.

## The roster

Gojo is the reference at 1.000. "Rendered" is the head-height target in game
pixels, and the Source column is the confidence note carried on each `heightCm`
in `characters.js`, which is where the numbers come from — if this table and
that file disagree, the file is right.

| Fighter | Canon | Ratio | Rendered | Source |
|---|---|---|---|---|
| Hanami | 220 cm | 1.140 | 169.9 px | cited |
| Dagon | 215 cm | 1.132 | 168.6 px | estimated (evolved form, drawn near Hanami's height) |
| Mechamaru | 205 cm | 1.079 | 160.8 px | estimated (the puppet) |
| Panda | 200 cm | 1.053 | 156.8 px | official |
| Geto | 190.5 cm | 1.003 | 149.4 px | cited |
| **Gojo** | **190 cm** | **1.000** | **149.0 px** | **official** |
| Todo | 190 cm | 1.000 | 149.0 px | official |
| Yaga | 188 cm | 0.989 | 147.4 px | estimated (none published) |
| Toji | 187 cm | 0.984 | 146.6 px | cited |
| Hakari | 185 cm | 0.974 | 145.1 px | estimated |
| Kashimo | 185 cm | 0.974 | 145.1 px | estimated (none published) |
| Nanami | 184 cm | 0.968 | 144.3 px | official |
| Choso | 181 cm | 0.953 | 141.9 px | cited |
| Naoya | 181 cm | 0.953 | 141.9 px | exhibition: "over 180 cm" |
| Jogo | 180 cm | 0.947 | 141.2 px | cited |
| Yuki | 180 cm | 0.947 | 141.2 px | estimated ("a very tall young woman"; no figure published) |
| Mahito | 179.1 cm | 0.943 | 140.5 px | cited |
| Yuta | 175.3 cm | 0.923 | 137.5 px | cited |
| Megumi | 175 cm | 0.921 | 137.2 px | official |
| Tengen | 175 cm | 0.921 | 137.2 px | estimated (an evolved body; none published) |
| Yuji | 173 cm | 0.911 | 135.7 px | official |
| Sukuna | 172.7 cm | 0.909 | 135.4 px | cited (vessel) |
| Kirara | 172 cm | 0.905 | 134.9 px | estimated ("young and slender"; none published) |
| Maki | 170 cm | 0.895 | 133.3 px | official |
| Mei Mei | 170 cm | 0.895 | 133.3 px | estimated (none published) |
| Gakuganji | 168 cm | 0.884 | 131.7 px | estimated (none published) |
| Haruta | 168 cm | 0.884 | 131.7 px | estimated ("short and slightly muscular"; none published) |
| Inumaki | 164 cm | 0.863 | 128.6 px | official |
| Miwa | 162 cm | 0.853 | 127.0 px | cited (fanbook figure widely quoted; unverified) |
| Nobara | 160 cm | 0.842 | 125.5 px | official |
| Momo | 150 cm | 0.840 | 125.2 px | estimated |
| Uro | — | 1.000 | 149.0 px | unknown |
| Reggie Star | — | 1.000 | 149.0 px | unknown |
| Kurourushi | — | 1.000 | 149.0 px | unknown ("stands fairly tall") |

**Confidence, honestly.** *Official* means a databook/profile figure repeated
consistently across sources. *Cited* means every height list agrees but the
figure never came from a databook — the suspiciously precise ones (172.7, 179.1,
190.5) are panel-measured fan estimates. *Estimated* means no figure exists and
the number was inferred: from a relative statement ("a very tall young woman",
"short and slightly muscular"), or from how the character is drawn beside
fighters whose height *is* known. *Unknown* means no figure and nothing firm
enough to infer one from; those three sit at the reference ratio, which is a
neutral default rather than a claim.

Note the split. The original roster is mostly *official* or *cited*. Almost
every fighter added since is *estimated* — not for want of looking, but because
no height was ever published for them. **Naoya** is the one recent fighter with
a real source (a JJK exhibition gave "over 180 cm"), and **Miwa**'s 162 is a
fanbook figure that circulates widely without a verifiable origin. When adding a
fighter, check for a published figure first; if there isn't one, say so in the
comment and give the reasoning behind the estimate, the way the entries above do.

## Editing

**By canon:** set `heightCm` in `characters.js`. Everything follows — but
`src/config_model_reach.js` holds attack reach measured *in game pixels* from
the posed rig, so a height change makes that fighter's envelope stale. Regenerate
it in the same commit:

```
node server.mjs &
node tools/derive_attack_envelopes.mjs
```

`node tools/audit_hitboxes.mjs` fails while it is stale, so this is caught rather
than discovered later.

**By eye:** the sprite workbench's **Character height** slider. It writes an
override into `headHeights` in the manifest, which wins over the canon-derived
value, and rescales every one of that fighter's frames live. *Reset to canon
height* removes the override. Export and apply through the usual flow.

`headHeights` in the manifest is an **override map**: empty of roster fighters by
default, holding only those whose size was set by hand. It currently holds one
entry, the summon `mahoraga` — every fighter on the roster is sized from canon.
