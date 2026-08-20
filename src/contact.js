// HOW CLEANLY A BLOW CONNECTS.
//
// A hitbox says what a swing THREATENS. It has never said where the swing IS:
// a jab's box runs from chest to floor so it catches a croucher (moves.js), so
// its centre is nobody's fist. `strike_points.js` is the missing fact — for
// one fighter, one move, where the blow actually lands — verified by a person
// against the drawing. This module is what the game does with it.
//
// TWO THINGS COME OUT OF IT. Where the impact is (so the spark is on the fist
// rather than at a fixed offset from the victim's navel), and how well that
// point CONNECTED, as a number from 0 to 1: how far past the near edge of the
// body the blow reached, and whether it was on the body's height at all. A
// fist buried in a chest is clean; a tip that just brushes the front of
// someone at maximum range, or a swing that passes over a croucher's head, is
// a graze.
//
// PRESENTATION, AND ONE PIECE OF FEEL. Quality drives the spark, the sound,
// the shake, the rumble and whether a Black Flash may roll — none of which
// changes who wins — and it scales HITSTUN, which does. Damage, knockback,
// growth and shield damage are deliberately untouched: a graze takes the same
// percent and sends you the same distance, it just does not hold you as long.
// That keeps the mechanic honest as a spacing reward rather than a second,
// invisible damage roll, and it keeps every existing balance number meaning
// what it meant.
//
// ONLY WHERE SOMEBODY LOOKED. The quality is `null` unless the attacker's
// strike point for this move is HUMAN-verified — not the rig's measurement,
// not the fallback derived from body height. A wrong point would quietly
// retune every trade in the game and be very hard to tell apart from a wrong
// RULE, so an unverified fighter plays exactly as they did before this
// existed: same FX, same stun, same Black Flash odds. `docs/strike-points.md`
// is where that gate was written down; this is it in code.

import { strikePoint } from "./strike_points.js";
import { bodyMetrics } from "./silhouette.js";
import { CONTACT } from "./config_tuning.js";
import { CONTACT_TIER } from "./flags.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Where a hit lands and how cleanly, for one contact.
 *
 * `point` is always usable — the caller draws its spark there. `quality` is
 * `null` whenever this hit is not one the tier has any business judging: a
 * projectile, a scripted set piece, an unverified strike point, or the flag
 * turned off. Every consumer treats null as "behave exactly as before".
 */
export function contactOf(owner, target, hit, source, box, fallback) {
  if (!CONTACT_TIER || source !== "melee") return { point: fallback, quality: null };
  const key = owner.spriteChar || owner.charKey;
  const sp = strikePoint(key, owner.animKey);
  if (sp.source !== "human") return { point: fallback, quality: null };

  // The blade, where it is: forward along the swinger's facing, up from their
  // feet. `x` mirrors with them, `y` does not — it is a height.
  const at = { x: owner.x + (owner.facing || 1) * sp.x, y: owner.y + sp.y };

  // HOW DEEP, AND WHETHER IT WAS ON THE BODY AT ALL. Two questions, because
  // the two ways a blow can be poor are different, and a single distance to
  // the centre of mass answers neither well: a hurtbox is around 25px wide and
  // 130 tall, so measuring x against a 12px half-width made every hit at
  // arm's length a graze, which is most hits.
  //
  // DEPTH is the spacing read. A swing thrown at maximum range puts its tip on
  // the victim's near edge; the same swing thrown from inside puts the fist
  // through their chest. So the measure is how far past the near edge — the
  // one facing the attacker — the strike point sits, as a fraction of the body
  // it is travelling into. `deep` says how far in counts as fully connected,
  // and everything past that stays full: driving a fist out the far side is
  // not less clean than stopping in the middle.
  //
  // Measured against the victim's DRAWN width rather than their hurtbox's: a
  // box is fitted to the main mass and can be half the width of the body it
  // belongs to (Gojo's is 25px against a 52px silhouette), and normalising by
  // that made the whole scale swing between nothing and everything across a
  // dozen pixels. The near edge of the box is still where depth starts — that
  // is where the body begins for hit purposes — but how far in is "in" is a
  // fact about the body.
  const dir = (owner.facing || 1);
  const near = dir > 0 ? box.x : box.x + box.w;
  const pen = (at.x - near) * dir;
  const width = bodyMetrics(target.spriteChar || target.charKey).width;
  const depth = clamp(pen / Math.max(1, width * CONTACT.deep), 0, 1);

  // HEIGHT is a containment test, not a second bullseye: a blow to the head is
  // as real as one to the ribs, and only one that passes ABOVE or BELOW the
  // body — over a croucher, under a jumper — is catching the outline. It falls
  // off over a margin rather than cutting out, because the box edge is a
  // measurement with a fit on it and not a hard fact about where a body stops.
  const above = box.y - at.y;
  const below = at.y - (box.y + box.h);
  const outside = Math.max(0, above, below);
  const contained = clamp(1 - outside / Math.max(1, box.h * CONTACT.vMargin), 0, 1);

  const quality = clamp(depth * contained, 0, 1);

  // The spark goes ON the body: the strike point can sit just outside the box
  // (that is what a graze IS), and a spark hanging in the air beside somebody
  // reads as a miss that hurt them.
  return {
    quality,
    point: {
      x: clamp(at.x, box.x, box.x + box.w),
      y: clamp(at.y, box.y, box.y + box.h),
    },
  };
}

/** Words for a number, for the debug overlay and the popup: three bands, so
 *  what the FX are doing can be read rather than guessed at. */
export function contactBand(quality) {
  if (quality === null || quality === undefined) return null;
  if (quality >= CONTACT.cleanAt) return "clean";
  if (quality <= CONTACT.grazeAt) return "graze";
  return "solid";
}

/**
 * HITSTUN, AND ONLY HITSTUN.
 *
 * The stun a hit already computes is `0.12 + kb * 0.00048`, clamped to
 * 0.12–1.35 — a real range with room in it. This bends where a hit sits inside
 * that range by how well it connected, then leaves the clamp to hold: a blow
 * through the middle holds the victim a little longer (and so combos out of
 * things it could not before), one that catches the outline barely holds them
 * at all.
 *
 * Bounded on both sides and applied to nothing else. The victim takes the same
 * damage and travels the same distance either way, so a graze cannot become a
 * stealth damage nerf and a clean hit cannot become a stealth buff — what
 * changes is how much time the attacker bought, which is the thing spacing
 * should be paying for.
 */
export function stunScale(quality) {
  if (quality === null || quality === undefined) return 1;
  return CONTACT.stunGraze + (CONTACT.stunClean - CONTACT.stunGraze) * quality;
}

/** How much of the presentation a hit earns: particle counts, shake and rumble
 *  all ride this. Never zero — a graze still happened. */
export function fxScale(quality) {
  if (quality === null || quality === undefined) return 1;
  return CONTACT.fxGraze + (CONTACT.fxClean - CONTACT.fxGraze) * quality;
}
