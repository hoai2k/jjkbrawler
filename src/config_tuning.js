// Feel dials — the numbers you change by hand to change how the game FEELS.
//
// Everything here is safe to edit without reading the code that consumes it.
// Nothing in this file is load-bearing for correctness: no value changes what
// a hit connects with, what an animation resolves to, or how the simulation
// steps. The worst a bad number here does is look or feel wrong.
//
// The division of labour across the three files you would edit by hand:
//
//   config_menus.js     content — roster grouping and every player-facing string.
//                 Affects no mechanics at all.
//   config_tuning.js     feel — motion amplitudes, tumble, defence knobs. Affects
//                 how the game reads and plays, never what it contains.
//   config_fx.js  spectacle — element particle recipes, trails, rumble.
//                 Purely presentational; see docs/effects-plan.md.
//   constants.js  physics, geometry and match rules — gravity, jump height,
//                 shield economy, blast zones, sprite cell size. Also
//                 tweakable, but these change what the game IS, and code
//                 depends on their relationships.
//
// Background for the motion values is in sprites/docs/sprite-motion.md; for the
// defence values, docs/combat-feel.md.

// ------------------------------------------------------------ character size
//
// Fighters are sized from their canon height. `heightCm` in characters.js holds
// the real figure (null where none was ever published); everything below turns
// that into the rendered head-height target the sprites are scaled to, which is
// the single global height control per character.

// Whose height counts as 1.0. Every other fighter is measured against this one.
export const HEIGHT_REFERENCE = "gojo";

// How much of the real height difference to keep. 0 makes everyone identical,
// 1 renders the roster at true relative scale.
//
// This used to be 0.6, compressing the roster toward a single 64x108 hurtbox
// that was the same for a 150 cm Momo and a 220 cm Hanami. Hurtboxes are now
// measured from each fighter's own art (src/silhouette.js), so there is nothing
// left to protect: a taller fighter is a bigger target, which is what being
// taller should mean. The clamps below became the real spread control.
export const HEIGHT_COMPRESSION = 1.0;

// Hard limits, and now the thing that actually sets how far apart the roster's
// extremes are drawn. True scale spans 1.47x across the roster, which is more
// than the stage's platform gaps and jump arcs are built for; these hold it to
// about 1.36x, with the ordering intact.
export const HEIGHT_MIN_RATIO = 0.84;
export const HEIGHT_MAX_RATIO = 1.14;

// Rendered head height in game pixels for a fighter at ratio 1.0.
//
// Was 175.3 (chosen to keep the roster's average drawn height unchanged when
// heights became canon). The level-design review (docs/level-design-review.md,
// G1) found that at that size no fighter could jump their own height and every
// main platform was only ~4–5 body-heights long — the boards had no room for
// Smash-style spacing or vertical play. 149 shrinks the roster ~15%: mains
// read ~5.3–6.5 body-heights, tier steps land near body height, and the
// dynamic camera (camera.js) zooms in to keep fighters visually large when
// the fight is close.
/**
 * THE ROSTER'S SIZE AGAINST THE BOARD, and the one number that sets it.
 *
 * Our fighters were about twice the size Smash's are relative to their stage: a
 * main platform ran 5.3 body heights where Battlefield runs 11-14, a full hop
 * cleared 1.06 of a body where Mario's clears 2.6, and a dash attack slid
 * further for the same reason. Those are not four problems. Jumps, gravity,
 * knockback, run speed and the platforms are all absolute pixels, so shrinking
 * the BODY moves every one of those ratios at once and touches no balance
 * number: the same jump reaches the same platform, and is worth more of a body
 * on the way.
 *
 * 0.7 is one step of that, not the whole distance — parity would be near 0.45
 * and would need the backgrounds redrawn to survive the camera zoom that keeps
 * fighters the size they are on screen. This is the step that costs no art.
 *
 * WHAT ELSE FOLLOWS IT. Everything that is fighter-SIZED rather than
 * board-sized, so the picture does not change scale, only the space around it:
 * the ground shadow (render.js), every particle, ring and popup (particles.js),
 * the platform slab's thickness (stages.js), and the camera's own framing —
 * zoomed in by 1/0.7 so a fighter lands on screen exactly as large as before
 * (camera.js). What deliberately does NOT follow it is anything belonging to
 * the BOARD: platform lengths and heights, blast zones, spawn spacing. That gap
 * opening up is the entire point.
 */
export const ART_SCALE = 0.7;

/** 149 was the roster's own height before the step above; this is what the
 *  game draws now. Every measurement of a body — hurtbox, reach, strike point,
 *  muzzle, centre of mass — is derived from the drawn art, so all of them
 *  follow this one number without a second edit. */
export const HEIGHT_BASE_PX = 149 * ART_SCALE;

// A fighter with no published height and nothing to infer from. 1.0 means "as
// tall as the reference", which is a neutral default rather than a claim.
export const HEIGHT_UNKNOWN_RATIO = 1.0;

// ------------------------------------------------------------ body measuring
//
// How src/silhouette.js turns a character's artwork into the three numbers
// hitboxes and hurtboxes are built from. These are the resilience dials: the
// bands decide how far the art has to move before the simulation notices, and
// the guards decide how wrong a broken export is allowed to make a fighter.
//
// The min/max pairs are fractions of the character's OWN drawn height, so they
// stay meaningful if the game is ever globally resized.

export const BODY = {
  // Rounding step for each measurement, in world px. Art that moves less than
  // this is invisible to gameplay — which is the point, because the art moves
  // constantly and matchups should not.
  reachBand: 6,
  widthBand: 4,

  // Guard range for how far a swing may be painted in front of a fighter.
  reachMin: 0.30,
  reachMax: 0.75,
  // How wide a typical fighter is, as a fraction of their own height, and how
  // much of the measured difference from that to keep.
  //
  // Height can be read straight off the art because heights were solved
  // deliberately against a common target. Width cannot: measured across the
  // roster's idles it spans 0.21 to 0.50 of height, and that spread is DRAWING
  // STYLE, not character — Yuji's idle is a slim three-quarter turn and Jogo's
  // is front-on with a cape, and neither fact should decide how easy they are
  // to hit. So the measurement is treated as directional evidence rather than
  // ground truth: a fighter drawn broad is broader than one drawn slight, by
  // less than the drawings differ. Round 14A asks for the consistent idle
  // stances that would let `widthTrust` go up.
  widthTypical: 0.38,
  widthTrust: 0.45,

  // Guards, in the same fractions of height. They should rarely bind now that
  // the measurement is compressed; they are here for a broken export.
  widthMin: 0.26,
  widthMax: 0.62,

  // From this many measurable swing frames on, the single furthest is thrown
  // away before the maximum is taken — one over-extended drawing should not be
  // able to set a character's range. Below it there is nothing to spare.
  reachDropTopFrom: 4,

  // How much of a fighter's measured distance from the roster median carries
  // into their range — the same shape as `widthTrust` above, and for a related
  // reason.
  //
  // The measurement is right about the ORDER and only roughly right about the
  // gaps. A drawing is a pose somebody chose: a fighter caught mid-lunge
  // measures longer than the same fighter drawn planted, and that is framing
  // rather than character. Taken literally it put 2.56x between the shortest
  // arms on the roster and the longest, which is a bigger spread than the
  // fighters are, and left the ends of the roster playing a different game
  // from the middle.
  //
  // So the ends come in a little: the shortest fighters get a few px they were
  // not drawn with and the longest give a few back, everyone keeps their place
  // in the order (this is a straight line through the median, so it cannot
  // reorder anybody), and a fighter at the median does not move at all. At
  // 0.85 the roster's spread goes 2.56x -> 2.28x and nobody shifts by more
  // than about 10 px. Turn it down to compress harder; 1 ships the measurement
  // exactly as drawn.
  //
  // `tools/audit_hitboxes.mjs` prints the measured number beside the shipped
  // one and fails if the order ever comes apart.
  reachTrust: 0.85,

  // What a character with no measurable art is treated as. Height matches
  // HEIGHT_BASE_PX; reach and width are the roster medians as measured in
  // docs/hitbox-audit.md, and are only ever used before any art has landed.
  fallbackHeight: 175.3,
  fallbackReach: 80,
  fallbackWidth: 74,
};

// How far from the centre line a VERIFIED STRIKE POINT may sit and still be
// read as that move's reach, as a fraction of the fighter's own drawn height.
//
// Deliberately far looser than BODY.reachMin/reachMax above, because it is
// guarding something else. Those bound a SCAN of the ink, which has no idea
// what it is looking at and needs holding to a plausible body. These bound a
// DECISION: somebody opened the drawing and put the point on the blade. The
// guard's whole job is to catch a misclick or a point left on art that has
// since been redrawn — not to argue with the reviewer about how long a
// naginata is. Maki's side smash lands at 1.10x her own height and that is
// simply what is drawn.
//
// A point outside the band is not clamped into it. It is reported as a fault
// (src/strike_reach.js reachFaults), the move falls back to the fighter's
// scalar reach, and the verification bench puts the item back in the queue —
// so a bad point costs a re-review rather than quietly setting a range at
// whatever the guard happened to be. One point on the roster trips it today.
export const STRIKE_REACH = {
  min: 0.10,
  max: 1.20,

  // ...and how HIGH a rising attack's contact point may be above the foot
  // line, on the same terms, as a fraction of the fighter's own drawn height.
  //
  // The vertical twin of the band above, and it exists for the same reason the
  // forward one does. An up attack's box used to be a hardcoded literal — its
  // top edge 1.88 body heights above the feet for everybody — while the fist
  // it is drawn around lands at 1.05 on Gojo and 1.34 on Maki. The strike arc
  // is drawn at the box's far edge, so every fighter's up attack marked itself
  // most of a body height above the arm throwing it.
  //
  // Same guard, same treatment: a point outside the band is not clamped, the
  // move keeps its authored literal, and the bench asks about the drawing.
  // 0.60 is under the shortest reach on the roster (Sukuna's 0.83) and 1.80 is
  // over the tallest (Maki's 1.34) with room for a redraw either way.
  upMin: 0.60,
  upMax: 1.80,

  // Where a strike point goes for a move nobody has verified and no rig has
  // measured, along the fighter's own reach (src/strike_points.js). Short of
  // their tip on purpose: the blow lands with the arm out, not at the far edge
  // of what the box threatens.
  derivedFrac: 0.75,
};

// PER-CHARACTER RANGE NUDGES, in game px, applied after the compression above.
//
// The escape hatch for a fighter who is still wrong after everything measured
// and everything tempered — a range that plays long or short in a way the
// drawings do not explain. Hand-edited on purpose, like the strike-point
// overrides it sits downstream of: a person decided this, and it should survive
// a re-measure and be obvious in a diff.
//
// It is a NUDGE and not an override: a few px, not a new number. Anything big
// enough to reorder the roster is the wrong tool — either the strike point is
// wrong (fix it in the verification bench, where the answer is about a drawing)
// or the whole roster is too spread out (turn `reachTrust` down). The audit
// fails if a nudge inverts any pair, so the order stays the drawings'.
//
// Empty is the honest default: nothing here has been asked for yet.
export const REACH_NUDGE = {
  // gojo: 4,
};

// FALLBACK ONLY. Characters whose idle carries a measured `bodyTop` are scaled
// so the top of the art lands exactly on the target (see idleSpan in
// heights.js); this approximates it from the detected body box for frames
// tools/bake_anchors.py has not reached. Verified constant across the original
// 17 fighters, which is why it works at all.
export const HEAD_ABOVE_BODY = 1.014;

// ---------------------------------------------------------------- anchors

// Fraction of a frame's height above the foot line where the centre of mass
// sits when a sprite carries no measured `anchors.com` — roughly navel height,
// which is where a human body actually pivots. Only a fallback: real values
// are measured offline by tools/bake_anchors.py.
export const COM_BODY_FRAC = 0.55;

/** How far an AIRBORNE drawing may be shifted to hang from its centre of mass,
 *  as a fraction of body height (src/render.js holdComMax).
 *
 *  The shift itself is the point — a body in the air should hang from its mass,
 *  not stand on a foot line that is somewhere different in every pose — but the
 *  per-frame `anchors.com` it is measured against is a BAKE, and
 *  tools/audit_sprite_com.mjs finds about 11% of upright frames more than 0.09
 *  of body height away from where a person placed that fighter's centre. Some
 *  of those are the pose (an up-attack really does raise the mass); some are
 *  the measurement. Capping the correction means a good anchor gets the full
 *  hold and a wild one gets a nudge — the fault stays in the audit instead of
 *  arriving on screen as a fighter jumping sideways.
 *
 *  0.10 covers the honest spread of upright poses with room to spare; the
 *  frames it clips are the ones the audit is already asking about. */
export const COM_HOLD_MAX_FRAC = 0.10;

/** How far a cross-fade will slide a body to line its two drawings up by their
 *  centre of mass, as a fraction of body height (`?smooth=com`; the fade
 *  itself is in src/render.js, which carries the reasoning).
 *
 *  The sibling of COM_HOLD_MAX_FRAC above and capped for the same reason: a
 *  per-frame `com` is a bake, not a judgement, so the worst a bad one may do
 *  is under-align a fade rather than throw a body sideways. A cap also
 *  degrades smoothly where a hard cutoff would pop between two poses either
 *  side of it.
 *
 *  0.12 is a bit over a body width, which covers the honest case this is for:
 *  a heavy that lunges really does carry its mass forward, and that lunge is
 *  exactly what an unaligned fade turns into two men standing apart.
 *
 *  It is ALSO the review threshold. A pair of adjacent drawings whose mass
 *  disagrees by more than this is a pair the fade cannot fully align — either
 *  the pose genuinely lunges that far or an anchor is wrong, and only a person
 *  can say which, so sprites/src/com_review.js reads the same number to decide
 *  what to put in front of one. */
export const XFADE_COM_MAX_FRAC = 0.12;

/** Seconds the COM hold takes to blend in after leaving the ground, and out
 *  again after landing (fighter.js comHoldW -> render.js holdComW).
 *
 *  The hold used to arrive as a STEP: the frame `grounded` flipped, the whole
 *  correction applied at once — a one-frame vertical jump of 14 px on the
 *  roster median (17 on Hanami), measured with tools/debug/probe_com_pop.mjs.
 *  Near ledges `grounded` flips constantly — walk-off, teeter-drop, catch,
 *  climb — which is exactly where the game was reported as flickery. A tenth
 *  of a second turns the jump into a slide short enough to read as the body
 *  settling into the air. */
export const COM_HOLD_EASE = 0.1;

// Where an unplaced `ledge` grip starts, as a fraction down the artwork. On a
// hang pose the topmost thing in the frame is the raised hand.
export const LEDGE_GRIP_Y_FRAC = 0.04;

// ----------------------------------------------------------------- tumble

// Above this knockback a launched fighter spins instead of sliding rigidly.
export const TUMBLE_KB_MIN = 620;
// Spin rate per unit of knockback beyond that, and its ceiling. Raise the
// first for more dramatic launches; lower the second if hits get illegible.
export const TUMBLE_SPIN_PER_KB = 0.0055;   // rad/s per unit of knockback
export const TUMBLE_SPIN_MAX = 13.5;        // rad/s

// ------------------------------------------------------- squash & stretch

// Master dial. 0 disables squash & stretch outright, 1 is the tuned amount,
// 0.5 halves it. Deliberately subtle — the values below peak near 4%.
export const SQUASH = 1;

// Depth of each effect, as a fraction off 1. `land: 0.045` compresses the
// sprite 4.5% at the deepest instant of a landing.
export const SQUASH_DEPTH = {
  land: 0.045,
  takeoff: 0.042,
  fall: 0.03,
  hit: 0.03,
};

// How long the landing squash and takeoff stretch take to recover, in seconds.
export const LAND_SQUASH_TIME = 0.17;
export const TAKEOFF_STRETCH_TIME = 0.13;

// ------------------------------------------------------- rotation & sway
//
// Rotations are radians, offsets are pixels. Everything is applied about the
// frame's centre-of-mass anchor except squash, which is anchored at the feet.

export const MOTION = {
  airLean: 0.10,          // rad at full horizontal air speed
  dashLean: 0.085,
  turnLean: 0.07,         // leaning against an abandoned direction mid-pivot
  runSway: 0.022,
  runBob: 1.6,            // px
  idleSway: 0.011,
  idleBob: 1.4,           // px
  breathRate: 4.4,        // rad/s — how fast the idle breathes
  shieldShake: 0.028,     // rad at a fully spent shield
  chargeShake: 0.03,
  chargeShift: 2.2,       // px
  swingBack: 0.065,       // attack anticipation, through startup
  swingThrough: 0.11,     // attack follow-through, through the active window
  hurtLean: 0.10,         // flinch on a hit too small to tumble
  dizzyWobble: 0.075,
  airDodgeTilt: 0.4,
  ledgeLean: 0.12,
  ledgeLeanIn: 0.12,      // s for the hang lean to arrive, instead of snapping
  // Teetering on a lip (fighter.js updateTeeter). The lean is OUTWARD, over
  // the drop, because that is what makes it read as a near-miss rather than as
  // standing; the sway is the recovery, slow and never quite settling. Both
  // are amplitudes on the idle pose, so they are what carries the state until
  // the round-22 drawing lands and they become its garnish.
  teeterLean: 0.075,      // rad, out over the edge
  teeterSway: 0.055,      // rad of counter-sway on top
  teeterRate: 3.1,        // rad/s of that sway
  teeterShift: 2.6,       // px of drift with it
  // How long the drawing takes to slide its front foot onto the lip
  // (`teeterLip` in render.js). The same 0.12s the lean uses, for the same
  // reason: the two arrive together, so the pose settles as one movement.
  teeterFootIn: 0.12,     // s
  summonSway: 0.045,      // hovering summons
  summonLunge: 0.12,      // and their lean into an attack
};

// ------------------------------------------------------------- afterimages

export const TRAIL_LEN = 5;         // number of ghosts behind a fast fighter
export const TRAIL_STEP = 2;        // sim steps between samples — a longer tail
export const TRAIL_ALPHA = 0.34;    // opacity of the ghost nearest the fighter

// Which states earn a trail, and how strongly. 0 means none.
export const TRAIL_STRENGTH = {
  tumble: 1,
  dodge: 0.85,
  dash: 0.6,
  // Projection Sorcery held down (see MACH below). Stronger than a dash
  // because these are not a blur of a fast body — they are the frames he
  // planned, and a plan you can barely see is not one worth drawing.
  mach: 1,
};

// ---------------------------------------------------- Projection Sorcery run
//
// Naoya's afterimages used to come free with any sustained run, which put a
// strip of film behind him for most of a normal match — the technique's whole
// read (he is executing planned frames, not moving fast) worn as a default.
//
// So the frames are OPTED INTO, on the button they belong to: hold B while
// running and he winds the choreography up — faster, and trailing. Let go and
// he is a man running. The trail is his own, not the generic blur: sampled
// further apart and drawn harder, so it reads as snapshots of where he has
// been rather than a smear of where he is.
export const MACH = {
  speedMul: 1.28,     // how much faster the held run is
  step: 5,            // sim steps between his samples (a blur trail is 2)
  len: 5,             // how many of them are kept
  alpha: 0.62,        // opacity of a planned frame (a blur ghost peaks at 0.34)
};

// ----------------------------------------------------------- strike arcs
//
// The crescent of energy a swing throws out, drawn at the exact distance the
// hitbox reaches (strikeArcs in moves.js decides where; drawStrikeArcs in
// render.js draws it). Nothing here changes what a move hits — the arc reads
// the hitbox, never the other way round — so these are pure look.

export const STRIKE_ARC = {
  // Height of the arc's centre of curvature, as a fraction of the character's
  // rendered height. Sideways swings pivot at the shoulder, so the crescent
  // hangs at the level of an outstretched arm or weapon; rising and falling
  // ones pivot at the hips, which is where the body folds around them.
  armHeight: 0.78,
  hipHeight: 0.50,

  // A forward box whose top edge sits this far below the shoulder is a low
  // strike — a crouch poke, a ground quake — and draws from its own height
  // rather than being dragged up to the arm.
  lowStrike: 0.28,

  // Angular half-width limits, radians. The arc takes its width from the
  // hitbox (`spanOfBox` of the box's cross-measure) and is held between these
  // so a shallow box still curves enough to read as a crescent rather than a
  // stripe, and a huge one does not wrap around the fighter.
  spanOfBox: 0.9,
  spanMin: 0.46,
  spanMax: 1.05,

  // Where an arc starts overlapping the fighter's own drawing rather than
  // curving around it, as a fraction of their drawn height: roughly half a
  // typical body width (BODY.widthTypical is 0.38 of height).
  //
  // A fraction and not the flat 46 px it used to be, which was about right for
  // a reference-height fighter and too big for everybody shorter.
  //
  // Two things read it. `hideInsideArt` below decides whether an arc this short
  // is drawn at all; render.js uses half of it as the point where the trailing
  // echoes and the sweetspot ring stop being worth drawing, which it does
  // whatever that switch says.
  minRadiusFrac: 0.19,

  // ...and whether a swing that short goes UNDRAWN.
  //
  // OFF, which is a change of mind. The old reasoning was that an arc inside
  // the art is not worth drawing, and it holds as far as it goes — a crescent
  // overlapping the fist it belongs to adds nothing. What it misses is that the
  // alternative is worse: the arc is the mark on a hitbox's real far edge, and
  // a swing that is live and hits and has NOTHING drawn on it is the one thing
  // the arc must never be. A fighter reaching that distance naturally is
  // exactly the case where the crescent is redundant rather than wrong, and
  // redundant beats absent.
  //
  // It also came up as a bug rather than a preference. `swingMove` scales an
  // aimed box by cos(tilt), so Gojo's side tilt aimed 60° up ended at 39 px,
  // fell under the floor, and vanished — caught by smoke_combat's "the drawn
  // arc agrees with the hitbox at every angle". Turning the suppression off
  // fixes that class outright rather than one tilt at a time.
  //
  // Set true to go back to hiding them, which is the only reason it is still a
  // switch: the two readings are worth being able to put side by side.
  hideInsideArt: false,

  // Thickness of the band, as a fraction of its radius, and its hard limits.
  // The soft glow around it is drawn at `glowWidth` times this.
  thickness: 0.10,
  thicknessMin: 6,
  // ...and how much of its own radius a band may be, which caps `thicknessMin`
  // on the short arcs that `hideInsideArt: false` now draws. Without it a 6 px
  // band on a 12 px radius reads as a bloom at the shoulder rather than as the
  // edge of a swing.
  thicknessOfRadius: 0.35,
  thicknessMax: 18,
  glowWidth: 1.7,

  // The swing extends to full reach over this fraction of the active window,
  // starting from this fraction of it — the crescent travels outward rather
  // than switching on at full size.
  reachIn: 0.35,
  reachFrom: 0.74,

  // Faint copies of the arc drawn inside the leading one, each a step closer to
  // the fighter and fainter than the last. They are the swing's own trail: the
  // gap between the end of the art and the far edge of the hitbox is real (see
  // VISIBLE_ART_REACH), and these carry the eye across it instead of leaving
  // the crescent hanging in space.
  echoes: 3,
  // How many short strokes each band is stepped along. A canvas gradient
  // cannot follow a curve, so the arc is drawn as a run of them (render.js).
  steps: 18,
  echoStep: 0.17,     // fraction of the radius each copy falls back
  echoFade: 0.34,     // and how much of the previous copy's opacity it keeps
  echoNarrow: 0.13,   // and how much of its half-span it gives up, so the
                      // trail closes to a point behind the leading edge
  echoLag: 0.20,      // how far behind the bright head trails, in span units

  // Peak opacity of the glow, the band, and the bright head that runs along
  // the band as the swing travels.
  glowAlpha: 0.22,
  alpha: 0.38,
  headAlpha: 0.55,
  // The band is drawn additively, which means it adds nothing over ground that
  // is already bright — an orange arc over sunlit foliage all but vanishes, and
  // that is the one frame the player most needs to read. So a dark band goes
  // down first, in normal compositing and a little wider than the band, giving
  // the light something to sit on whatever is behind it.
  shadeAlpha: 0.30,
  shadeWidth: 1.35,
  // Width of that head, as a fraction of the arc's half-span.
  headWidth: 0.45,

  // ---- the SIMPLE setting (Settings > Strike Arcs)
  //
  // The arc is the most stroke-heavy thing the renderer draws — a full one is
  // `steps` x `echoes` x three strokes, and it runs per live hitbox, so its
  // cost climbs with how many fighters are swinging at once. This is the dial
  // for that, and it is deliberately NOT a fidelity slider: everything the arc
  // exists to SAY survives it.
  //
  // What the arc says is distance (the leading crescent sits on the hitbox's
  // far edge), the sweetspot ring, and the launch-angle arrow. All three are
  // kept. What goes is the echo trail — faint copies drawn inside the leading
  // crescent, which are decoration — and some of the smoothness of the curve.
  // Measured through the real draw path, one live hitbox: 138 stroke calls a
  // frame down to 38, a 3.6x cut, with no reading lost.
  simpleSteps: 10,
  simpleEchoes: 1,

  // ---- what the arc SAYS, beyond where the swing reaches
  //
  // The crescent already showed distance, because its radius is the hitbox's
  // own. These make it show the other two things a player has to read off an
  // attack before committing to it: how hard it hits, and which way it will
  // send them.

  // Strength. Damage at which a swing draws at full weight — everything is
  // scaled against this, so a jab is a thin quick line and a charged smash is
  // a heavy bright one. `chargeBoost` is how much a full charge adds on top.
  powerRef: 15,
  powerMin: 0.35,
  powerMax: 1.6,
  chargeBoost: 0.4,
  // How much of that carries into the band's thickness, its opacity, and how
  // many echoes trail behind it.
  powerThickness: 0.55,
  powerAlpha: 0.4,
  echoesMin: 1,
  echoesMax: 4,

  // Launch angle. A short arrow at the leading edge of the swing, pointing the
  // way the hit will throw whoever it lands on — the one thing about an attack
  // that was previously invisible until after it connected.
  angleTick: 26,        // px at full power
  angleTickAlpha: 0.85,
  angleTickWidth: 3,

  // Sweetspot. A brighter ring sitting at the distance where the move is
  // strongest (moves.js tipBand / an authored critBand), so spacing for the tip
  // is something a player can see rather than something they memorise.
  sweetAlpha: 0.5,
  sweetWidth: 2.2,
};

// ------------------------------------------------------------ melee range
//
// How far past the painted art each kind of attack is allowed to connect, in
// world px at reference height. This is the *whole* invisible part of a swing:
// a move's far edge is the character's measured art reach (src/silhouette.js)
// plus the margin below.
//
// It replaces `REACH_SCALE`, a single global multiplier on hand-typed reach
// numbers that produced hitboxes 1.55x-2.89x past the art depending on who you
// picked. The point of expressing forgiveness as an absolute margin rather than
// a multiplier is that everyone now gets the SAME forgiveness — a long-armed
// fighter's advantage comes from their arms, not from a bigger lie.
//
// `scale` is the one number to reach for if melee feels too generous or too
// mean across the board. `near` is where a forward box starts, as a fraction of
// the fighter's own body width, so a broad fighter's swing clears their body.

export const MELEE_GRACE = {
  scale: 1,
  near: 0.5,

  jabEarly: 12,     // the opening jabs of a chain: no reward for mashing
  jab: 18,          // the finisher
  side: 24,
  up: 22,
  down: 18,
  air: 22,
  sideHeavy: 34,    // heavies commit, and are forgiven more for it
  upHeavy: 30,
  downHeavy: 26,
  airHeavy: 28,
};

// EXTRA reach on top of the per-move grace above, in world px — the knob for
// "attacks feel like they should have connected".
//
// The grace above is a margin over the STRIKE POINT: where a person said the
// blow lands, which is a fist's centre and not the front of the drawing. The
// drawing keeps going. A sleeve, a claw, the far half of a weapon and the sweep
// of the swing all sit past that point, so an attack could visually overlap an
// opponent and do nothing — Dagon's side smash ended 3 px INSIDE his own ink,
// and 77 of the roster's 204 forward attacks were within 8 px of theirs.
//
// Two parts, and both are here to be turned:
//
// `short` and `long` are how much is added at the two ends of the roster,
// interpolated by where a fighter's own reach sits between the shortest and the
// longest. More for the short end because that is who needs it: deriving range
// from the drawings moved everybody, and the fighters it moved DOWN are the
// ones who lost a hit they used to land. It also spends the compression budget
// where it does least harm — a few px on the shortest arms on the roster
// changes the spacing game much less than the same few px on the longest.
//
// `pastArt` is the floor under all of it: every forward attack connects at
// least this far past the INK of the drawing it is thrown on, whatever the
// interpolation above worked out to. That is the part that answers "it looked
// like it hit". It is held inside STRIKE_REACH.max of the fighter's height, so
// a frame with a big cursed-energy cloud on it cannot hand somebody the stage.
// WHERE THE DEFAULTS CAME FROM. Deriving range from the drawings shortened most
// of the roster: the mean side-smash tip went 142 px -> 113 px against the rig
// numbers it replaced. `short`/`long` buy that back part of the way, and these
// are the measured means at a few settings (node tools/audit_hitboxes.mjs
// prints the live ones):
//
//     short  long   mean smash tip   mean forward tip
//         0     0            112.6              99.4
//        18     3            126.2             111.2
//        24     4            130.9             115.7   <- shipping
//        30     6            135.9             120.5
//        36     8            140.9             125.4
//        42    10            145.9             130.3   (past the old numbers)
//
// The rig-derived game was 141.9 / 132.3. 24/4 sits almost exactly halfway on
// forward attacks overall and a little toward the old feel on smashes, which is
// the "somewhere in between" this was asked for. Raise both to go back toward
// the old reach, drop them toward 0 to play the drawings as measured.
export const ADDED_RANGE = {
  short: 20,
  long: 0,
  pastArt: 8,
};

// How much of a move's reach its BOX actually spans, for the moves that are not
// a plain swing straight out in front.
//
// These were literals sitting inline in moves.js, which meant the one question
// somebody actually wants to ask — "why does the quake cover so much ground?" —
// had to be answered by reading the move table. They are range scaling, the
// same as MELEE_GRACE, and they belong beside it.
//
// SPANS multiply the move's tip to get how far a straddling box reaches on EACH
// side of the fighter. A rising or falling attack is thrown along the centre
// line, so its width is a swing's arc seen end-on rather than its reach — which
// is why up and down are under 1 while the quake, which is a shockwave leaving
// both sides along the floor, is nearly double.
//
// NEAR multiplies MELEE_GRACE.near, which is where a forward box starts as a
// fraction of the fighter's own body width. A low poke and an aerial start
// closer in than a standing swing does, because the body is not in the way of
// either in the same way.
export const MELEE_SPAN = {
  up: 0.9,            // up tilt and up air
  upHeavy: 1.0,       // the up smash, which spans its whole reach
  down: 0.8,          // the meteor
  downHeavy: 1.9,     // the quake
  nearLow: 0.8,       // the crouch poke
  nearAir: 0.7,       // every aerial

  // The least vertical span a rising box may keep once its top comes off the
  // art (`rising`, moves.js), written for a reference-height fighter like every
  // other vertical literal. It is a backstop against a contact point pointed
  // low enough to collapse the box onto the hip line it starts from, not a
  // number anybody should need to tune.
  risingMin: 60,

  // The narrowest a forward box may be, as a fraction of the fighter's own body
  // width. It only binds on a move whose tip barely clears the near edge — a
  // very short poke on a very broad fighter — and it is there so such a move
  // has a box at all rather than a sliver.
  minWidth: 0.45,
};

// What reach costs. `amount` is how much of a fighter's relative reach carries
// into their startup and recovery — at 0.55, the longest arms on the roster are
// about 24% slower than the median and the shortest about 13% quicker.
// `clamp` bounds how far from the median a fighter can be judged, so a future
// outlier pays a capped price instead of becoming unplayable.
export const REACH_PRICE = {
  amount: 0.55,
  clamp: 0.5,
};

// Tip sweetspots. A swing that reaches meaningfully past the roster earns a
// band at the end of its arc where it hits hard, and is weak everywhere inside
// it — Marth's tipper. It is what turns range from a stat into something a
// player has to space for.
//
// `minReachRatio` is how far past the roster's median art reach a character has
// to be drawn before their side attacks get one. Authored bands (Nanami's 7:3)
// always win over this.
export const SWEETSPOT = {
  // At 1.12 this is the genuinely long-armed handful rather than half the
  // roster — a tipper is a characteristic, and everyone having one is nobody
  // having one.
  minReachRatio: 1.12,
  // How far outside the hitbox's tip the band sits, standing in for the
  // half-width of whoever is being hit (the band is a centre-to-centre
  // distance). Roughly a median half-body.
  inset: 30,
  tolerance: 26,      // px of centre-to-centre distance either side of the band
  dmg: 1.32, kb: 1.24, growth: 1.12,
  sourDmg: 0.74, sourKb: 0.7,
};

// ------------------------------------------------------------------ turns

// Seconds a facing flip takes to sweep the sprite through side-on, rather than
// snapping the mirror in one frame.
export const TURN_TIME = 0.07;

// ---------------------------------------------------------------- defence
//
// The knobs docs/combat-feel.md calls out as the ones to reach for if DI or
// move staling feels wrong. They lived inline in combat.js.

// How far the victim's stick can bend a launch, in radians. ~17 degrees,
// matching the influence a Smash player gets: enough to change where you land,
// never enough to ignore the hit.
export const DI_MAX_TURN = 0.30;
// And how much holding along the launch vector scales its speed, either way.
export const DI_SPEED = 0.08;

// Move staling: how many recent landed moves are remembered, and how much each
// repeat in that queue costs. Floors live alongside their use in combat.js.
export const STALE_QUEUE = 9;
export const STALE_DMG_STEP = 0.09;   // ~0.28x damage at 8 repeats
export const STALE_KB_STEP = 0.06;

// ------------------------------------------------------------ contact quality
//
// How cleanly a blow connects (src/contact.js), from the verified strike point
// to the victim's centre of mass. One block, because every one of these is a
// knob somebody will want to turn after ten minutes of playing with it, and
// because what the tier is allowed to touch should be readable in one place:
// the FX and the sound and the shake, and hitstun. Not damage, not knockback,
// not shield damage.
export const CONTACT = {
  // How far INTO the victim a blow has to reach to count as fully connected,
  // as a fraction of their DRAWN width, measured from the edge of their
  // hurtbox facing the attacker. Just over half a body: a swing thrown at
  // maximum range leaves its tip on the front of them and scores near zero,
  // the same swing thrown from inside buries it and scores one.
  deep: 0.55,
  // And how far above or below the box a blow may pass before it scores
  // nothing, as a fraction of the box height. A margin rather than a cliff —
  // the box is a measurement with a fit on it, not the exact edge of a body.
  vMargin: 0.22,
  // Where the three words start. Only labels — the FX and the stun ride the
  // continuous number, so moving these changes what the overlay SAYS and
  // nothing about what a hit does.
  cleanAt: 0.66,
  grazeAt: 0.28,

  // HITSTUN, the one thing here that is not presentation. Multipliers on the
  // stun a hit already computed, which stays clamped to its own 0.12–1.35
  // range afterwards. Deliberately modest at the top and generous at the
  // bottom: a clean hit should combo a little further than it used to, a
  // graze should feel like it nearly missed, and neither should rewrite a
  // matchup on its own.
  stunClean: 1.18,
  stunGraze: 0.62,

  // Particle counts, camera shake and rumble, same shape.
  fxClean: 1.25,
  fxGraze: 0.55,

  // A graze's element sound: quieter, and pitched up so it reads as a scrape
  // rather than a thud at low volume.
  grazeGain: 0.6,
  grazePitch: 1.18,

  // A Black Flash is cursed energy landing within a millionth of a second of
  // the fist. It may not roll on a blow that barely touched: quality has to be
  // at least this to be eligible at all, and the odds are unchanged above it.
  blackFlashMin: 0.5,
};
