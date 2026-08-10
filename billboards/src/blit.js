// The blit: a rendered pose texture into the 2D world, honouring every option
// drawCharFrame promises (see the contract in src/render_backend.js).
//
// This is sprites.js's placement arithmetic restated for a texture whose
// geometry is KNOWN instead of measured: the model origin (between the feet)
// sits at the texture's horizontal centre, and the foot line sits FOOT_FRAC up
// from the texture's bottom — renderer.js frames every pose that way. So where
// the sprite path reads ox/bodyBottom out of the manifest, this computes the
// same anchors from two constants and the rig's height. What must match
// sprites.js exactly is the ORDER of transforms: squash about the foot line,
// rotation about the centre of mass, mirror last — a billboard fighter must
// squash, spin and flip like a sprite fighter or every piece of game feel in
// motion.js reads differently across the two backends.
//
// Size comes from the same chain sprites use: headHeightTarget(charKey) is the
// fighter's on-screen height in game px (src/heights.js), and the rig's real
// height in metres maps onto exactly that. opts.scale is honoured as a RATIO
// against the actor's own solved scale, so a caller that passes a non-default
// scale (summons draw actors at cfg.scale) still gets the size it asked for.

import { headHeightTarget } from "../../src/heights.js";
import { getActor } from "../../src/characters.js";
import { TEX_SIZE, FOOT_FRAC } from "./renderer.js";

/** Centre of mass height as a fraction of body height — the pivot rotations
 *  turn about. The hips, effectively; sprites derive theirs per frame, and
 *  when models are the norm this could come from the Hips bone per pose. */
const COM_FRAC = 0.55;

export function blitPose(ctx, entry, charKey, x, y, opts = {}) {
  const targetPx = headHeightTarget(charKey);
  const actorScale = getActor(charKey)?.scale;
  const scaleRatio = opts.scale && actorScale ? opts.scale / actorScale : 1;

  // Game px per texture px: the rows the body spans in the texture
  // (rowsPerMetre × its real height) must land at targetPx on screen.
  const rowsForBody = entry.rowsPerMetre * entry.heightM;
  const s = (targetPx * scaleRatio) / rowsForBody;

  const drawW = TEX_SIZE * s;
  const drawH = TEX_SIZE * s;
  const footRow = TEX_SIZE * (1 - FOOT_FRAC); // texture row of world y=0
  const comY = -targetPx * scaleRatio * COM_FRAC; // above the feet, world px

  const facing = opts.facing ?? 1;
  const rotation = opts.rotation || 0;
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;

  ctx.save();
  ctx.translate(x + (opts.offsetX || 0), y + (opts.offsetY || 0));
  // Same order as sprites.js drawCharFrame: squash keeps the feet planted and
  // widens about the com's x (here: the origin column), rotation turns about
  // the com point itself.
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (rotation !== 0) {
    ctx.translate(0, comY);
    ctx.rotate(rotation);
    ctx.translate(0, -comY);
  }
  ctx.scale(facing < 0 ? -1 : 1, 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.glowBlur ?? 14;
  }
  ctx.drawImage(entry.canvas, -drawW / 2, -footRow * s, drawW, drawH);
  ctx.restore();
  return true;
}
