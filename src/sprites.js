import { frameMeta, frameImage } from "./assets.js";
import { animFor } from "./characters.js";
import { CELL_W, CELL_H, CELL_FOOT_Y } from "./constants.js";
import { clamp } from "./utils.js";

// Draws a fighter frame with its feet anchored at (x, y). Frames are placed
// using their manifest offsets relative to the logical sheet cell, with the
// detected body-bottom as the foot line so ground animations don't bob.
export function drawCharFrame(ctx, charKey, frameKey, x, y, opts = {}) {
  const meta = frameMeta(charKey, frameKey);
  const img = frameImage(charKey, frameKey);
  if (!meta || !img) return;

  // renderScale corrects frames whose art is drawn at a different zoom than
  // the character's standing sprites (see tools/extract_sprites.py)
  const scale = (opts.scale ?? 0.6) * (meta.renderScale || 1);
  // The sheets are drawn facing RIGHT (verified across every character's run
  // row); only the frames the manifest marks `faceLeft` are drawn facing left.
  // Mirror so the fighter always looks in their logical direction.
  const facing = (opts.facing ?? 1) * (meta.faceLeft ? -1 : 1);
  const anchorY = clamp(meta.bodyBottom ?? CELL_H * CELL_FOOT_Y, CELL_H * 0.45, CELL_H * 1.2);

  ctx.save();
  ctx.translate(x, y);
  if (opts.rotation) ctx.rotate(opts.rotation);
  ctx.scale(facing, 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.glowBlur ?? 14;
  }
  ctx.drawImage(
    img,
    (meta.ox - CELL_W / 2) * scale,
    (meta.oy - anchorY) * scale,
    meta.w * scale,
    meta.h * scale
  );
  ctx.restore();
}

export function currentFrame(charKey, animKey, animTime) {
  const anim = animFor(charKey, animKey);
  const idx = Math.floor(animTime * anim.fps);
  const i = anim.loop ? idx % anim.frames.length : Math.min(idx, anim.frames.length - 1);
  return anim.frames[i];
}
