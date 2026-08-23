// Derives concrete attack data (timings + hitboxes) from each character's
// light/heavy profiles. Keeps per-character data compact while giving every
// fighter a full Smash-style kit:
//   light:  jab chain (3 steps), side tilt, up tilt, down tilt (crouch), aerials
//   heavy:  side smash (chargeable), up smash, down smash, air heavy
//
// ---------------------------------------------------------------------------
// Where a move's RANGE comes from.
//
// It used to be a hand-typed `reach` per character, pulled toward the sprites
// by a single global `REACH_SCALE = 0.62`. That produced hitboxes reaching
// about 2.1x as far as the art, with the size of the gap varying 1.55x-2.89x
// between fighters — the same 20 px of spacing was a hit on one character and a
// whiff on another, for no reason a player could see. It also made range the
// flattest stat in the game (1.13x across the roster) and left it correlated
// with nothing: longer-reaching moves came out very slightly FASTER.
// docs/hitbox-audit.md has the measurements.
//
// Range is now derived from the art. A move's far edge is what that move is
// drawn to reach, plus an explicit grace margin per move type — so the
// invisible part of every attack is the same small, deliberate amount for
// everybody instead of an accident of how each character happened to be drawn.
//
// PER MOVE, not per fighter (`moveReach`, src/silhouette.js). Every attack has
// a contact point somebody verified against the drawing, so every attack has
// its own range: Toji's side smash lands three times as far out as his crouch
// poke and the boxes say so, where one scalar per character had them ending
// within a few px of each other. The scalar (`artReach`) is still there for the
// moves struck along the centre line — an up smash, a quake — which have no
// forward reach to measure, and for everything that just wants to know how long
// a fighter's arms are.
//
// AND OFF THE ART THE PLAYER IS LOOKING AT. Under the sprite backend those
// points are the ones placed on the sprites; under `?render=3d` they come off
// the rigs (src/silhouette.js `source`). The same fighter therefore reaches
// slightly differently in the two, because in the two they are different
// shapes — which is the honest version of a renderer toggle, and better than
// the sprite game inheriting ranges from models most players never see.
//
// The trade Smash prices range against is startup and endlag, and it is priced
// here too: `priceOf` slows a long-armed fighter's attacks and speeds up a
// short-armed one's, against the roster median.
//
// Vertical geometry scales with the character. The literals below are written
// for a fighter of HEIGHT_BASE_PX and multiplied through `g.vy` — otherwise a
// 153 px Momo throws an up smash whose box floats 73 px above her own head.

import {
  STRIKE_ARC, MELEE_GRACE, MELEE_SPAN, ADDED_RANGE, REACH_PRICE, SWEETSPOT,
  HEIGHT_BASE_PX, ART_SCALE,
} from "./config_tuning.js";
import { SAKURAI, SMASH_TILT_ANGLE, DASH_LUNGE_DRAG } from "./constants.js";
import {
  artReach, bodyWidth, bodyMetrics, moveHeight, moveReach, paintedReach,
  rosterReach, rosterReachSpan,
} from "./silhouette.js";
import { strikePoint } from "./strike_points.js";
import { hurtboxFit } from "./body_points.js";
import { clamp } from "./utils.js";

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * How far in front of a fighter their art is drawn to reach — the number the
 * debug overlay's "art cap" marks and the sprite workbench draws its range
 * targets against.
 *
 * Per character because the art is, and per MOVE when a state is named, because
 * the art is that too: the cap is only telling the truth about the margin if it
 * is the cap for the move whose box is next to it. Without a state it is the
 * fighter's longest swing, which is the right answer for "how long are this
 * fighter's arms".
 */
export function visibleArtReach(char, state = null) {
  const key = keyOf(char);
  if (!state) return artReach(key);
  // Whichever of the two art bounds is actually deciding this move's box: where
  // the blow lands, or where the drawing stops. The line is there to make the
  // margin past the art readable, so it has to be drawn at the bound the margin
  // was measured from — see tipOf.
  return Math.max(moveReach(key, state), paintedReach(key, state) ?? 0);
}

function keyOf(char) {
  return char?.key || "";
}

/**
 * The geometry of one fighter, resolved once per move.
 *
 * `vy` rescales a vertical literal written for a reference-height fighter onto
 * this one, so "up smash reaches above the head" stays true at both ends of the
 * roster.
 */
function geo(char) {
  const m = bodyMetrics(keyOf(char));
  return {
    charKey: m.charKey,
    width: m.width,
    height: m.height,
    reach: m.reach,
    vy: (px) => px * (m.height / HEIGHT_BASE_PX),
  };
}

/**
 * The far edge of a move's hitbox: where the art gets to, plus this move type's
 * grace margin. `MELEE_GRACE.scale` softens or tightens all of it.
 *
 * `state` names the animation this move plays, which is what the verified
 * strike points are filed under — so a move that has its own reviewed contact
 * point is built from THAT rather than from the fighter's longest swing, and a
 * jab stops ending where a spear thrust does. Omit it and the move gets the
 * fighter's scalar reach, which is right for the ones struck along the centre
 * line: an up smash and a quake have no forward reach to measure.
 *
 * The grace margin is added identically either way. It is the whole invisible
 * part of a swing and the one thing that must not vary per character — a long
 * fighter's advantage comes from their arms, not from a bigger lie.
 */
function tipOf(g, variant, state = null) {
  const base = MELEE_GRACE[variant] ?? MELEE_GRACE.side;
  const grace = (base + addedFor(g)) * MELEE_GRACE.scale;
  const tip = moveReach(g.charKey, state) + grace;
  // ...and never inside the drawing. A forward attack connects at least
  // ADDED_RANGE.pastArt past the ink of the frame it is thrown on, whatever the
  // arithmetic above worked out to, because a swing that visually overlaps an
  // opponent and does nothing is the complaint this whole chain exists to
  // answer. Straddling moves pass no state and have no forward ink to floor on.
  const ink = paintedReach(g.charKey, state);
  return ink == null ? tip : Math.max(tip, ink + ADDED_RANGE.pastArt * MELEE_GRACE.scale);
}

/**
 * The extra px this fighter's attacks get on top of the per-move grace, by
 * where their reach sits between the shortest and longest on the roster.
 *
 * More at the short end, and see ADDED_RANGE for why: deriving range from the
 * drawings moved everybody, the fighters it moved DOWN are the ones who lost
 * hits they used to land, and a few px on the shortest arms in the game
 * disturbs spacing far less than the same few px on the longest.
 */
function addedFor(g) {
  const { min, max } = rosterReachSpan();
  const t = max > min ? clamp((g.reach - min) / (max - min), 0, 1) : 0;
  return ADDED_RANGE.short + (ADDED_RANGE.long - ADDED_RANGE.short) * t;
}

/**
 * Startup and recovery multiplier for a fighter's reach. Long arms are slow
 * arms; short ones are quick. Clamped so an outlier at either end pays a
 * bounded price rather than becoming unusable.
 */
function priceOf(g) {
  const ref = rosterReach() || g.reach;
  const over = clamp((g.reach - ref) / ref, -REACH_PRICE.clamp, REACH_PRICE.clamp);
  return 1 + over * REACH_PRICE.amount;
}

/** A box in front of the fighter: near edge just clear of the body, far edge
 *  at the move's tip. */
function forward(g, tip, oy, h, nearMul = 1) {
  const ox = g.width * MELEE_GRACE.near * nearMul;
  return {
    ox, w: Math.max(g.width * MELEE_SPAN.minWidth, tip - ox),
    oy: g.vy(oy), h: g.vy(h),
  };
}

/** A box centred on the fighter, reaching out `span` in both directions —
 *  rising, falling and quaking attacks. */
/**
 * A box centred on the fighter, spanning `span` across them — how every attack
 * thrown along their own centre line is shaped.
 *
 * `sweep` is the move SAYING which way it comes out, because the rectangle
 * cannot: a rising strike, a meteor and a ground quake are all a wide box
 * straddling a fighter, and they are three different pictures. See strikeArcs.
 */
function straddle(g, span, oy, h, sweep) {
  return { ox: -span / 2, w: span, oy: g.vy(oy), h: g.vy(h), sweep };
}

/**
 * A RISING box — an up tilt, an up air, an up smash — sized off the art the way
 * a forward one is.
 *
 * `oy`/`h` are the authored literals, written for a reference-height fighter
 * and scaled by `g.vy` like every other vertical in this file. They still set
 * where the box ENDS, at the hip, because that end is about the fighter's own
 * body and not about the swing.
 *
 * The TOP is the part that was wrong. It was the literal too, so every fighter
 * on the roster threw an up attack topping out at the same fraction of their
 * own height — 1.88 of it for a tilt, 2.17 for a smash — while the fist the
 * move is drawn around gets to 1.05 body heights on Gojo and 1.34 on Maki. The
 * strike arc is drawn at the box's far edge, so what a player saw was a
 * crescent hanging eighty-odd px above the arm that threw it, on everybody.
 *
 * So the top comes off the verified contact point plus this move's own grace,
 * exactly as `tipOf` does for a forward swing, and falls back to the literal
 * for a fighter whose up attack nobody has pointed yet (`moveHeight` is null
 * for Jogo). Held to a minimum span so a low-pointed rig cannot collapse the
 * box onto the hip line it starts from.
 */
function rising(g, span, oy, h, variant) {
  const bottom = g.vy(oy + h);
  const measured = moveHeight(g.charKey, "upHeavy");
  const grace = ((MELEE_GRACE[variant] ?? MELEE_GRACE.up) + addedFor(g)) * MELEE_GRACE.scale;
  const top = measured == null
    ? g.vy(oy)
    : Math.min(-(measured + grace), bottom - g.vy(MELEE_SPAN.risingMin));
  return { ox: -span / 2, w: span, oy: top, h: bottom - top, sweep: "up" };
}

/**
 * The height a move's crescent hangs at: where this fighter's blow actually
 * LANDS on the drawing for it, in game px from the foot line.
 *
 * Read here, where the character and the state are both known, and recorded on
 * the move — the same hand-off `sweep` makes, and for the same reason. By the
 * time `strikeArcs` has a box it has no idea whose it is, so it was placing
 * every sideways arc at one fraction of body height and correcting with a
 * guess: a box hanging low enough drew from its own vertical CENTRE instead.
 * Both readings were wrong wherever it mattered. A quake is a shockwave along
 * the FLOOR and drew at shoulder height; a crouch poke drew at a standing
 * fighter's shoulder, over a fighter who is visibly ducked; and a swing aimed
 * steeply down tripped the guess and dropped its arc to the ankles, so the
 * pivot jumped 77 px between two adjacent stick angles.
 *
 * The contact point answers all three, because it is the one number that knows
 * both the pose and the move. Null for a point nobody has placed or measured —
 * `strikeArcs` keeps the body-fraction fallback for those, and for the
 * projectiles and summon strikes that have no state at all.
 */
function pivotOf(g, state) {
  if (!state) return null;
  const p = strikePoint(g.charKey, state);
  return p && p.source !== "derived" && Number.isFinite(p.y) ? p.y : null;
}

/**
 * A tip sweetspot for a move that reaches well past the roster.
 *
 * This is Marth's tipper, and it is how range gets paid for a second time: a
 * long disjoint hits hardest only at the very end of its arc and weakly up
 * close, so reach becomes something a player has to space for rather than a
 * stat they were handed. Derived from the tip rather than authored per
 * character, so it follows whatever the art does — a fighter who is redrawn
 * holding something longer earns a tipper without anyone editing a table.
 *
 * `critBand` is matched against the distance between the two fighters' CENTRES
 * (combat.js), while `tip` is measured from the swinging fighter's centre — so
 * the band sits outside the tip by `inset`, which stands in for the half-width
 * of whoever is being hit. A fixed inset rather than the attacker's own width:
 * the body that matters is the target's, it is not known when the move is
 * built, and a band placed off the wrong one drifts out of reach entirely
 * (Maki's sat 15 px past anything she could actually connect with).
 *
 * `ring` is the same band expressed as a distance from the fighter, for the
 * strike arc to draw. Nothing reads it in the simulation.
 */
function tipBand(g, tip) {
  if (g.reach < (rosterReach() || g.reach) * SWEETSPOT.minReachRatio) return null;
  return {
    center: tip + SWEETSPOT.inset,
    tolerance: SWEETSPOT.tolerance,
    ring: tip,
    dmg: SWEETSPOT.dmg, kb: SWEETSPOT.kb, growth: SWEETSPOT.growth,
    sourDmg: SWEETSPOT.sourDmg, sourKb: SWEETSPOT.sourKb,
    label: "TIP!",
  };
}

/**
 * The height an AIMED swing pivots at when the fighter throwing it is ducked —
 * the crouched shoulder, as a fraction of a crouched body rather than a
 * standing one.
 *
 * `pivotOf` answers with the contact point, which is the right answer for a
 * move as it was authored and the wrong one for a move that has since been
 * rotated: the crouch poke's blow lands at ankle height because that is where a
 * low poke ends, and swinging a 40° arc about THAT puts the crescent under the
 * stage. A rotation needs the joint it turns about, and for a ducked fighter
 * that is a shoulder they are holding low.
 *
 * `crouch` is measured off the fighter's own ducking art (silhouette.js), so a
 * fighter drawn barely bending keeps a high shoulder and one drawn folded up
 * gets a low one.
 */
export function crouchPivot(char) {
  const key = keyOf(char);
  const m = bodyMetrics(key);
  // The REVIEWED crouch height, not the raw measurement: `b.crouch` is a scan
  // of the ducking art and the hurtbox fit is a person's correction to it
  // (combat.js hurtbox builds a crouch box the same way round). On Gojo the two
  // are 83 px and 58 px apart, and taking the scan would put the shoulder an
  // arc pivots about above the head it belongs to.
  const duck = m.height * m.crouch * hurtboxFit(key, "crouch").h;
  return -STRIKE_ARC.armHeight * duck;
}

export function lightMove(char, variant, jabStep = 0) {
  const p = char.light;
  const g = geo(char);
  const s = (p.speed || 1) / priceOf(g);
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "punch",
    anim: "light",
  };

  switch (variant) {
    case "jab": {
      const finisher = jabStep >= 2;
      const tip = tipOf(g, finisher ? "jab" : "jabEarly", "light");
      return {
        ...base,
        delay: 0.05 / s, dur: 0.09,
        recover: (finisher ? 0.24 : 0.13) * priceOf(g),
        ...forward(g, tip, -92, 98),
        pivotY: pivotOf(g, "light"),
        dmg: round1(p.dmg * (finisher ? 0.95 : 0.5)),
        baseKb: finisher ? 330 : 90,
        growth: finisher ? 6.0 : 1.0,
        // The jab chain is exactly what the Sakurai angle exists for: it keeps
        // a weak hit along the floor where it can be followed up, and pops the
        // victim off their feet once it is strong enough to.
        angle: finisher ? p.angle : SAKURAI,
        critBand: finisher ? p.critBand || null : null,
        label: finisher ? p.label : null,
        lungeVx: 40,
      };
    }
    case "side": {
      const tip = tipOf(g, "side", "light");
      return {
        ...base,
        delay: 0.07 / s, dur: 0.12, recover: 0.2 * priceOf(g),
        ...forward(g, tip, -90, 92),
        pivotY: pivotOf(g, "light"),
        dmg: round1(p.dmg), baseKb: 310, growth: 5.8, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: p.label, lungeVx: 90,
      };
    }
    // The DASH ATTACK — a run's own attack, thrown out of a dash or a sprint.
    //
    // It is the side tilt's opposite trade. A tilt is what you throw because it
    // is safe: short startup, short recovery, back to neutral. This one travels
    // with the run behind it (`lunge`, so the slide carries through the swing
    // instead of dying the moment the action locks), hits harder than anything
    // else off a light press, and then leaves you standing in it — recovery is
    // nearly twice a tilt's, which is what makes running in a decision rather
    // than the default approach.
    //
    // `lunge` and not `keepMomentum`, which is what this used to be and which
    // means no friction AT ALL. The lunge kick is added on top of the run, so
    // the move opened at 902 px/s against a 452 px/s run, held that for the
    // whole 0.6 s and ended still doing 902 — 556 px of swing and 481 px of
    // free coast after it, 1037 px in total across a 784 px platform. One light
    // press crossed the stage. It was also backwards: HOLDING the direction
    // travelled less (670 px), because only the held branch clamps to the run
    // speed. A lunge decays as it goes and plants when the action ends unless
    // the direction is still held (fighter.js), so the numbers now run the way
    // round a player would guess.
    case "dash": {
      const tip = tipOf(g, "side", "dashAttack");
      return {
        ...base,
        anim: "dashAttack",
        delay: 0.08 / s, dur: 0.13, recover: 0.34 * priceOf(g),
        ...forward(g, tip, -94, 104),
        pivotY: pivotOf(g, "dashAttack"),
        dmg: round1(p.dmg * 1.1), baseKb: 330, growth: 6.2, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: "Dash " + p.label,
        lungeVx: 44 * ART_SCALE, lunge: true, lungeDrag: DASH_LUNGE_DRAG,
      };
    }
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.06 / s, dur: 0.13, recover: 0.2 * priceOf(g),
        ...rising(g, tipOf(g, "up") * MELEE_SPAN.up, -196, 130, "up"),
        dmg: round1(p.dmg * 0.9), baseKb: 300, growth: 6.0, angle: 1.15,
        label: "Rising " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "crouchAttack",
        delay: 0.05 / s, dur: 0.12, recover: 0.18 * priceOf(g),
        ...forward(g, tipOf(g, "down", "crouchAttack"), -52, 54, MELEE_SPAN.nearLow),
        pivotY: pivotOf(g, "crouchAttack"),
        dmg: round1(p.dmg * 0.85), baseKb: 250, growth: 5.0,
        // A low poke that stays low. With the flat launch pop gone (combat.js)
        // this finally sends a grounded opponent sliding rather than popping
        // them up at 29 degrees regardless of what it was authored at.
        angle: SAKURAI,
        label: "Low " + p.label,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.16, recover: 0.14 * priceOf(g),
        ...forward(g, tipOf(g, "air", "airLight"), -104, 104, MELEE_SPAN.nearAir),
        pivotY: pivotOf(g, "airLight"),
        dmg: round1(p.dmg * 0.95), baseKb: 290, growth: 5.9, angle: 0.5,
        label: "Aerial " + p.label,
      };
    case "upAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.15, recover: 0.14 * priceOf(g),
        ...rising(g, tipOf(g, "up") * MELEE_SPAN.up, -210, 120, "up"),
        dmg: round1(p.dmg * 0.9), baseKb: 280, growth: 6.1, angle: 1.3,
        label: "Air Rising " + p.label,
      };
    case "downAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.07 / s, dur: 0.15, recover: 0.18 * priceOf(g),
        ...straddle(g, tipOf(g, "down") * MELEE_SPAN.down, -8, 96, "down"),
        dmg: round1(p.dmg * 1.05), baseKb: 240, growth: 6.6, angle: -1.25,
        label: "Meteor " + p.label, spike: true,
      };
    default:
      return lightMove(char, "side");
  }
}

export function heavyMove(char, variant, charge = 0) {
  const p = char.heavy;
  const g = geo(char);
  const price = priceOf(g);
  const s = (p.speed || 1) / price;
  const chargeMul = 1 + 0.55 * charge;
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "slashHeavy",
    shieldMul: p.shieldMul || 1.6,
    heavy: true,
    charge,
  };

  switch (variant) {
    case "side": {
      const tip = tipOf(g, "sideHeavy", "sideHeavy");
      return {
        ...base,
        anim: "sideHeavy",
        delay: 0.15 / s, dur: 0.14, recover: 0.3 * price,
        ...forward(g, tip, -96, 108),
        pivotY: pivotOf(g, "sideHeavy"),
        dmg: round1(p.dmg * chargeMul), baseKb: 430 * (1 + 0.25 * charge), growth: 8.4, angle: p.angle,
        // An authored band (Nanami's 7:3) is a character's own decision and
        // wins; otherwise a long enough swing earns a tipper from its reach.
        critBand: p.critBand || tipBand(g, tip),
        label: p.label, lungeVx: 130,
      };
    }
    // The heavy DASH ATTACK: the running shoulder-charge. A smash cannot be
    // charged at a run — a charge is a fighter standing still deciding to — so
    // the heavy button out of a dash commits to one uncharged swing instead of
    // stopping the run dead. It is the hardest hit available without a charge,
    // and it is paid for in the longest recovery on the ground.
    case "dash": {
      const tip = tipOf(g, "sideHeavy", "dashAttackHeavy");
      return {
        ...base,
        anim: "dashAttackHeavy",
        delay: 0.13 / s, dur: 0.15, recover: 0.42 * price,
        ...forward(g, tip, -96, 112),
        pivotY: pivotOf(g, "dashAttackHeavy"),
        dmg: round1(p.dmg * 0.95), baseKb: 420, growth: 8.0, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: "Charging " + p.label,
        lungeVx: 62 * ART_SCALE, lunge: true, lungeDrag: DASH_LUNGE_DRAG,
      };
    }
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.14 / s, dur: 0.16, recover: 0.32 * price,
        ...rising(g, tipOf(g, "upHeavy") * MELEE_SPAN.upHeavy, -226, 160, "upHeavy"),
        dmg: round1(p.dmg * 0.95 * chargeMul), baseKb: 440 * (1 + 0.25 * charge), growth: 8.8, angle: 1.35,
        critBand: p.critBand || null,
        label: "Skyward " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "downHeavy",
        delay: 0.17 / s, dur: 0.15, recover: 0.34 * price,
        ...straddle(g, tipOf(g, "downHeavy") * MELEE_SPAN.downHeavy, -64, 78, "sides"),
        pivotY: pivotOf(g, "downHeavy"),
        dmg: round1(p.dmg * 0.9 * chargeMul), baseKb: 400 * (1 + 0.25 * charge), growth: 7.8, angle: 0.9,
        critBand: p.critBand || null,
        label: "Quake " + p.label, quake: true,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.13 / s, dur: 0.16, recover: 0.2 * price,
        ...forward(g, tipOf(g, "airHeavy", "airLight"), -104, 110, MELEE_SPAN.nearAir),
        pivotY: pivotOf(g, "airLight"),
        dmg: round1(p.dmg * 0.9), baseKb: 380, growth: 7.6, angle: 0.48,
        critBand: p.critBand || null,
        label: "Aerial " + p.label,
      };
    default:
      return heavyMove(char, "side", charge);
  }
}

// ------------------------------------------------------------- strike arcs
//
// Where a swing's crescent of energy is drawn. This is the ONLY place that
// decides it, and it decides it from the hitbox: the arc's radius is the
// distance the box actually reaches, so retuning a move's reach moves the
// visual with it and neither can drift from the other.
//
// The one thing the box does not supply is height. Hitboxes are deliberately
// generous downward — a jab's box runs from chest to floor so it catches a
// crouching opponent — and drawing the arc at the box's centre would put every
// punch at hip level. So the arc is placed off the CHARACTER instead: a
// sideways swing hangs at the level of an outstretched arm, a rising or
// falling one sits directly above or below. Only the reach comes from the box.

/**
 * How far out a swing has got, as a fraction of its full reach, `k` of the way
 * through its active window.
 *
 * A melee box used to exist at full length from its first active frame, which
 * is why it had to be so wide: it had to cover everywhere the arm WOULD be. A
 * swing that extends instead means the tip only threatens once the arm has
 * actually got there, so spacing and timing are the same question — which is
 * what a tip sweetspot needs to be worth anything.
 *
 * Both the hitbox (combat.js) and the crescent drawn around it (render.js) call
 * this, so the picture and the thing it describes cannot come apart.
 */
export function swingExtent(k) {
  const A = STRIKE_ARC;
  return A.reachFrom + (1 - A.reachFrom) * Math.min(1, clamp(k, 0, 1) / A.reachIn);
}

/** Half the angular width of an arc of `radius` covering `half` px of the
 *  hitbox's cross-measure, held inside the readable range. */
function arcSpan(half, radius) {
  const raw = Math.atan2(half * STRIKE_ARC.spanOfBox, radius);
  return clamp(raw, STRIKE_ARC.spanMin, STRIKE_ARC.spanMax);
}

/**
 * The arcs a melee box throws, in fighter-local coordinates with the fighter
 * facing +x and y running downward as canvas does (so the foot line is 0 and
 * the head is negative). The renderer mirrors the whole frame for facing.
 *
 * Each arc is `{ pivotY, radius, aim, span, minRadius }`: a band of constant `radius`
 * about a centre of curvature `pivotY` above the feet, covering `aim ± span`
 * where 0 points forward, -PI/2 straight up and +PI/2 straight down.
 *
 * Returns 0-2 of them — two for a move that comes out both sides at once, and
 * none for a box too small to be worth drawing around.
 *
 * @param {{ox:number, oy:number, w:number, h:number}} m  the hitbox
 * @param {number} bodyH  the fighter's rendered height, foot line to head
 */
export function strikeArcs(m, bodyH) {
  // Where an arc would start overlapping the fighter's own art. It rides on
  // every arc returned, because render.js decides how far in the trailing
  // echoes and the sweetspot ring are worth drawing off it.
  const minRadius = STRIKE_ARC.minRadiusFrac * bodyH;
  // And whether being that short is a reason not to draw at all. Off by
  // default — see STRIKE_ARC.hideInsideArt for why redundant beats absent.
  const floor = STRIKE_ARC.hideInsideArt ? minRadius : 0;
  const drawable = (r) => r > 0 && r >= floor;
  const box = { x0: m.ox, x1: m.ox + m.w, y0: m.oy, y1: m.oy + m.h };
  const armY = -STRIKE_ARC.armHeight * bodyH;
  const hipY = -STRIKE_ARC.hipHeight * bodyH;
  const straddles = box.x0 < 0;

  // WHICH WAY THE SWING COMES OUT, and the move is asked before the box is.
  //
  // A rising strike, a meteor and a ground quake are all one wide box centred
  // on a fighter. The rectangle cannot tell them apart, so this used to guess
  // from its aspect ratio — "taller than it is wide, so it must be vertical" —
  // and the width of an up attack's box is the fighter's own REACH. That made
  // the picture a fact about arm length: Maki's up attack drew as two arcs at
  // her sides where Gojo's drew as one over his head, for the same move. It
  // was never stable either. Across the roster, nineteen of thirty-four
  // fighters sat within 20 px of the line, five of them within 5 — Toji was
  // one pixel from reading as a different attack, and a nudge in the sprite
  // workbench would have moved him across it.
  //
  // It is the same lesson `aimTilt` already carries below: a box's own
  // geometry cannot tell you what the swing MEANT. So `straddle` labels the
  // move and this reads the label.
  const sweep = m.sweep || guessSweep(m, straddles);
  if (sweep === "up") {
    return vertical(box, armY, -Math.PI / 2, m.w / 2, minRadius, drawable);
  }
  if (sweep === "down") {
    return vertical(box, hipY, Math.PI / 2, m.w / 2, minRadius, drawable);
  }
  // "sides", and everything else, falls through: a quake really does come out
  // both ways along the floor, and so the two-armed branch below is its
  // picture rather than a fallback it lands in.

  // WHAT HEIGHT THE SWING COMES FROM.
  //
  // The move's own contact point (`pivotOf`), which is where this fighter's
  // blow actually lands on the drawing for this attack. Everything before it
  // was a guess off the box, and the box is the wrong thing to ask: hitboxes
  // are deliberately generous downward — a jab's runs from chest to floor so
  // it catches a crouching opponent — so its centre is nobody's fist and its
  // top edge is nobody's shoulder.
  //
  // Two guesses, both wrong where it showed. Arm height for everything meant a
  // ground quake drew its shockwave at the fighter's shoulders. The escape
  // hatch for that — a box hanging low enough draws from its own vertical
  // CENTRE — never caught the quake and did catch the steep aimed swings,
  // dropping their arcs to ankle height: on Gojo the pivot jumped 77 px
  // between two adjacent stick angles, which is the "crouched sprite, standing
  // arc" the audit opened on.
  //
  // The body fraction stays as the fallback for a box with no move behind it —
  // a projectile, a special, a summon's strike — which is what it was always
  // suited to being.
  const pivotY = Number.isFinite(m.pivotY) ? m.pivotY : guessPivot(box, armY, bodyH);
  const half = m.h / 2;
  // WHICH WAY THE SWING WENT.
  //
  // Dead ahead unless the move was ANGLED, in which case swingMove recorded
  // the tilt it swung the box by and the crescent turns with it. Taken from
  // the move rather than re-derived from the box: a box's own geometry cannot
  // tell a 45° uppercut apart from a level strike that simply hangs low, and
  // guessing turned every ordinary attack's arc downward.
  //
  // The angled smash carried a note saying the arc followed the aim "for
  // free". It did not — this was hardcoded to zero, and only `low` moved it,
  // and only once a box had dropped far enough to trip that. And once it was
  // read here it still did not reach the screen, because `spawnMelee` was not
  // copying it onto the hitbox this is called with (combat.js).
  const aim = m.aimTilt || 0;
  const arcs = [];
  const fwd = reachAlong(box, pivotY, aim);
  if (drawable(fwd)) {
    arcs.push({ pivotY, radius: fwd, aim, span: arcSpan(half, fwd), minRadius });
  }
  // Backward too, for the down-smash quakes whose box spans both sides.
  const back = reachAlong(box, pivotY, Math.PI);
  if (straddles && drawable(back)) {
    arcs.push({ pivotY, radius: back, aim: Math.PI, span: arcSpan(half, back), minRadius });
  }
  return arcs;
}

/**
 * How far the box reaches ALONG one direction from the arc's pivot: the
 * distance at which a ray leaving `(0, pivotY)` at `aim` leaves the rectangle.
 *
 * This is the whole of "the arc is drawn at the hitbox's own far edge", and it
 * used to be `ox + w` — the box's forward edge — which is only that distance
 * when the swing is level. Aim one and it stopped being true twice over.
 * `swingMove` scales an angled box by the cosine of its tilt, so the forward
 * edge shrinks; and the arc was then drawn at that shrunken distance along a
 * line the box no longer ended on. Gojo's jab aimed 62° up reaches 59 px along
 * its own swing and was marked at 37, which is inside his shoulder — the
 * upward diagonals had arcs, and they were drawn where nobody would see them.
 *
 * Reduces to the old answer exactly when `aim` is 0, and to `armY - y0` and
 * `y1 - hipY` for the two verticals, so nothing that was already right moved.
 */
function reachAlong(box, pivotY, aim) {
  const dx = Math.cos(aim), dy = Math.sin(aim);
  const top = box.y0 - pivotY, bottom = box.y1 - pivotY;
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, box.x1 / dx);
  else if (dx < -1e-6) t = Math.min(t, box.x0 / dx);
  if (dy > 1e-6) t = Math.min(t, bottom / dy);
  else if (dy < -1e-6) t = Math.min(t, top / dy);
  return Number.isFinite(t) ? t : 0;
}

/**
 * The old height guess, kept — like `guessSweep` below — for the boxes that
 * carry no contact point: a projectile's, a special's, a summon's strike.
 *
 * Arm height, unless the box sits low enough that the strike is plainly a low
 * one, in which case it draws from its own middle because that is the only
 * thing about it anybody knows. It was the rule for EVERYTHING until the melee
 * normals started saying where their blow lands, and both halves of it were
 * wrong on the moves that mattered: the quake never tripped the low test and
 * drew its shockwave at the shoulders, while a steeply aimed swing did trip it
 * and dropped its crescent to the ankles. Reduced to the fallback it is good
 * at, it goes on doing what it always did for the boxes that have nothing
 * better.
 */
function guessPivot(box, armY, bodyH) {
  const low = box.y0 > armY + STRIKE_ARC.lowStrike * bodyH;
  return low ? (box.y0 + box.y1) / 2 : armY;
}

/**
 * The old aspect-ratio guess, kept for boxes nobody labelled.
 *
 * Every melee move built here says what it is. Projectiles, specials, summon
 * strikes and anything a character kit spawns by hand do not, and they still
 * need a crescent — so the guess stays as the fallback it always should have
 * been, rather than as the rule.
 */
function guessSweep(m, straddles) {
  if (!straddles) return "sides";
  if (m.h > m.w * 1.2) return m.oy + m.h <= 0 ? "up" : "down";
  if (m.oy > -m.h * 0.3) return "down";       // hanging at or below the feet
  return "sides";
}

/** The one-arc list for a straight-up or straight-down strike — empty when the
 *  radius is not worth drawing, which by default means only "not positive".
 *  See STRIKE_ARC.hideInsideArt. */
function vertical(box, pivotY, aim, half, minRadius, drawable) {
  const radius = reachAlong(box, pivotY, aim);
  if (!drawable(radius)) return [];
  return [{ pivotY, radius, aim, span: arcSpan(half, radius), minRadius }];
}

/**
 * Swing a melee box about the fighter, by `tilt` radians (positive is DOWN, as
 * y is). Mutates and returns the move.
 *
 * The box keeps its distance and travels along the new line rather than being
 * nudged off the old one, so an angled attack reaches as far as a level one.
 * The crescent follows because strikeArcs above reads the angle back off the
 * box — which it did NOT do until the diagonals arrived, whatever the note
 * here used to claim.
 *
 * Extracted from the angled smash, which had this inline and was the only
 * thing that could aim. It is now the one definition of what "aim an attack"
 * means to the hitbox, so a diagonal tilt and a charged smash's analogue tilt
 * cannot drift apart — and so the POSE can be aimed at the same angle knowing
 * the box went with it (fighter.js aimPointFor).
 */
export function swingMove(move, tilt) {
  if (!tilt) return move;
  // Kept so strikeArcs can turn the crescent the same way — see the note there
  // for why it is recorded rather than measured back off the box.
  move.aimTilt = (move.aimTilt || 0) + tilt;
  const radius = move.ox + move.w * 0.5;
  move.oy += Math.sin(tilt) * radius;
  move.ox *= Math.cos(tilt);
  move.w *= Math.cos(tilt);
  move.angle = clamp(move.angle - tilt * SMASH_TILT_ANGLE, -1.2, 1.4);
  return move;
}
