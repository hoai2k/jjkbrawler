# Near-field garnish cards — intake

Deliveries for the garnish layer — asked for as **18F**, now delivered and
recorded in [the history](../../../docs/asset-requests-history.md#18f-near-field-cards-for-the-garnish-layer--14-images-optional):
the flat cards the 2.5D camera flies between the lens and the fight
([src/camera3d/garnish.js](../../../src/camera3d/garnish.js)).

Same format as a sprite, not a background: PNG on a flat key screen (magenta
`#FF00FF`, or grey `#808080` for warm subjects), one subject per file, margin on
all four sides, at least 1000 px on the long edge. Anything that travels
sideways is drawn pointing **left** — the renderer mirrors it for the other
direction, and `assets/intake/garnish/` is exempt from the facing detector for
exactly that reason (`NO_MIRROR_DIRS`, tools/intake.py).

They are keyed and trimmed on import like any other sprite, land at
`assets/sprites/garnish/<name>.png`, and are read by `garnish.js` in place of
its procedural stand-in drawing. A card with no delivery keeps the drawing it
has, so this can land one file at a time.

**Round 18F delivered all fourteen.** Anything here now is a redraw of one of
them, or a new element — a new element also needs a spawner in `garnish.js`,
the way `signal_gantry` did.
