// THE ONE PLACE that decides which image a character frame is drawn from.
//
// A character frame reaches the screen through two different blitters, and
// they are not layered — neither calls the other:
//
//   sprites/src/sprites.js  drawCharFrame  canvas 2D, ctx transforms, drawImage
//   src/camera3d/billboards.js  drawChar   a textured quad, the same transform
//                                          chain rebuilt as a matrix
//
// That is a deliberate design (the 2.5D camera needs a matrix, not a canvas
// state machine) and it is not going away. What it must NOT also duplicate is
// the ANSWER to "which pixels are this pose": the moment those two disagree,
// the game draws one thing and every tool, bench and test measures another.
//
// It has happened once already and cost a shipped feature. Clothing FX
// (src/clothing_fx.js) hooked the sprite blitter alone. The settings toggle
// worked, the pass returned a keyed canvas, the arena bench rendered it
// correctly — and no player ever saw it, because the arena bench draws flat and
// the game draws through the 2.5D camera. Everything passed and the feature did
// nothing.
//
// So: no runtime module reaches for `frameImage` to DRAW a character. They call
// `frameArt` and get whatever the game has decided that pose looks like right
// now, effects included. tools/check_char_art.mjs holds the line.

import { frameImage } from "./assets.js";
import { clothingFrame } from "./clothing_fx.js";

/** The image a character frame draws from, with every per-frame effect that
 *  changes the ARTWORK already applied.
 *
 *  Whatever comes back is the same size as the underlying drawing — an effect
 *  here may repaint pixels, never resize or reposition them — so a caller's
 *  placement maths, `meta.ox/oy/w/h` and every measurement stay exactly as they
 *  were. Effects that move a body belong in the blitters, which own transforms.
 *
 *  `img` overrides the lookup for a caller that already holds a drawing: the
 *  sprite workbench stands two alternates of a pose side by side, and neither
 *  is the one `frameImage` would resolve. It still goes through the effects,
 *  because a workbench showing un-keyed art while the game keys it is the same
 *  class of lie this module exists to prevent.
 *
 *  `view` is passed to `frameImage` (`{ preview }` — the art being worked on
 *  rather than the art in play).
 */
export function frameArt(charKey, frameKey, { view, img } = {}) {
  return clothingFrame(charKey, frameKey, img ?? frameImage(charKey, frameKey, view));
}
