# Near-field garnish cards — intake

Deliveries for **18F** in [docs/asset-requests.md](../../../docs/asset-requests.md):
the flat cards the 2.5D camera flies between the lens and the fight
([src/camera3d/garnish.js](../../../src/camera3d/garnish.js)).

Same format as a sprite, not a background: PNG on a flat key screen (magenta
`#FF00FF`, or grey `#808080` for warm subjects), one subject per file, margin on
all four sides, at least 1000 px on the long edge. Anything that travels
sideways is drawn pointing **left** — the renderer mirrors it for the other
direction.

They are keyed and trimmed on import like any other sprite, then read by
`garnish.js` in place of its procedural stand-in drawing. A card with no
delivery keeps the drawing it has, so this can land one file at a time.
