// HUMAN-VERIFIED FACTS ABOUT A FIGHTER'S BODY.
//
// Written by the verification bench (`/workbench/?edit=verification`, task
// sets "centre-of-mass" and "muzzle-points"): a person looked at
// the drawing and said where the thing actually is. Paste the bench's export
// blocks in here and commit — this is the one place these decisions live, and
// nothing here is generated, so a re-bake of any measurement cannot undo it.
//
// Every key is optional. Absent means "use the roster default", which is what
// the game did before anybody checked:
//
//   com        centre of mass as a FRACTION of drawn height. The default is
//              COM_BODY_FRAC (0.55, config_tuning.js).
//
//              THIS IS THE PER-FIGHTER VALUE, and it is not the whole story.
//              Where a fighter's mass sits changes with their pose, and the
//              sprite manifest already carries a per-FRAME `anchors.com` for
//              every drawing — that is what the sprite renderer pivots a
//              tumble and a squash about (sprites.js), and it is editable in
//              the sprite workbench. This value serves the consumers that
//              have no frame to consult: the prone/tumble hurtbox centre
//              (combat.js), the chest line an aim solves from and the pivot
//              the rig rotates about in a 3D scene (backend.js,
//              camera3d/models.js), and the fallback for art that arrives
//              before the anchor bake has run. The two do not compete — one
//              is per drawing, the other is per fighter.
//   muzzle     { x, y } in game px from the fighter's centre line and foot
//              line (up is negative) — where a projectile leaves them. This is
//              the fighter's ANSWER FOR EVERY POSE, and the one other render
//              modes inherit.
//
//              A pose that throws from somewhere else can say so under
//              `states`, keyed by the animation the move plays —
//              specialNeutral, specialSide, specialDown, ult:
//
//                "gojo": { muzzle: { x: 62, y: -104,
//                                    states: { specialDown: { x: 40, y: -58 } } } }
//
//              Resolution order is in src/muzzle.js: the per-pose entry, then
//              this one, then the rig's measured hand for that pose
//              (config_model_reach.js), then the reference body's 70, -86
//              scaled onto this fighter's height. Everything is optional and
//              absent means "the next answer down", so an empty file is
//              exactly the behaviour the game had before anybody checked.
//
// There is deliberately no ledge-grip key. Where the hand meets the lip is a
// per-frame `ledge` anchor in the sprite manifest, baked on every hang frame
// and draggable in the sprite workbench — a second copy here would be a
// duplicate that drifts.

export const BODY_POINTS = {
  "choso": { com: 0.585, muzzle: { x: 53, y: -113 } },
  "dagon": { com: 0.605, muzzle: { x: 14, y: 0 } },
  "gakuganji": { com: 0.597, muzzle: { x: 1, y: -74 } },
  "geto": { com: 0.569, muzzle: { x: 35, y: -133 } },
  "gojo": { com: 0.577, muzzle: { x: 55, y: -115 } },
  "hakari": { com: 0.641, muzzle: { x: 57, y: -111 } },
  "hanami": { com: 0.595, muzzle: { x: 69, y: -133 } },
  "inumaki": { com: 0.583, muzzle: { x: 39, y: -107 } },
  "jogo": { com: 0.553, muzzle: { x: 54, y: -97 } },
  "kurourushi": { com: 0.55, muzzle: { x: 49, y: -104 } },
  "mahito": { com: 0.591 },
  "maki": { com: 0.6, muzzle: { x: 73, y: -128 } },
  "mechamaru": { com: 0.591, muzzle: { x: 45, y: -131 } },
  "megumi": { com: 0.598, muzzle: { x: 42, y: -104 } },
  "meimei": { com: 0.638, muzzle: { x: 66, y: -150 } },
  "momo": { com: 0.623, muzzle: { x: 65, y: -64 } },
  "nanami": { com: 0.596, muzzle: { x: 41, y: -97 } },
  "nobara": { com: 0.614, muzzle: { x: 48, y: -84 } },
  "panda": { com: 0.497 },
  "reggie": { com: 0.564, muzzle: { x: 36, y: -115 } },
  "sukuna": { com: 0.591, muzzle: { x: 54, y: -105 } },
  "todo": { com: 0.591 },
  "toji": { com: 0.614, muzzle: { x: 53, y: -116 } },
  "uro": { com: 0.577 },
  "yuji": { com: 0.582 },
  "yuki": { com: 0.623 },
  "yuta": { com: 0.618, muzzle: { x: 49, y: -81 } },
};

/**
 * Per-fighter, per-state corrections to the hurtbox, RELATIVE to the box
 * combat.js derives. Written by the "hurtbox-fit" task set.
 *
 *   w, h    multipliers on the derived size, applied about the box's own
 *           bottom edge (the foot line). Default 1.
 *   dx, dy  a shift of the whole box — `dx` forward along the facing as a
 *           fraction of the derived WIDTH, `dy` up as a fraction of the
 *           derived HEIGHT. Default 0. This is for the drawings that sit
 *           off-centre in their cell: without it, covering a body that has
 *           leaned to one side means widening the box on the empty side too,
 *           which is a fighter being hit out of thin air.
 *
 * Relative rather than absolute on purpose: the derived box tracks the art
 * (height and width are measured from the drawings, and the crouch and air
 * fractions from those poses), so a fighter whose sprites are redrawn keeps a
 * correct box. Pixel sizes and pixel offsets would both freeze the decision at
 * whatever the art was on the day somebody looked.
 *
 * A case a reviewer approved as-derived IS written here, as `{ w: 1, h: 1 }` —
 * an identity that changes nothing, and the only way the review queue can tell
 * "checked and correct" from "nobody has looked yet".
 *
 * Cases: stand | crouch | air | hurt | prone | ledge.
 */
export const HURTBOX_FIT = {
  // "hanami": { air: { w: 1.1, h: 0.95, dx: -0.08 } },
};

/** Who checked what, and when. Same keys; `at` is an ISO date. */
export const BODY_POINT_META = {
  "choso": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "dagon": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "gakuganji": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "geto": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "gojo": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "hakari": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "hanami": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "inumaki": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "jogo": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "kurourushi": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "mahito": { com: { at: "2026-08-15" } },
  "maki": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "mechamaru": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "megumi": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "meimei": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "momo": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "nanami": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "nobara": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "panda": { com: { at: "2026-08-15" } },
  "reggie": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "sukuna": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "todo": { com: { at: "2026-08-15" } },
  "toji": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
  "uro": { com: { at: "2026-08-15" } },
  "yuji": { com: { at: "2026-08-15" } },
  "yuki": { com: { at: "2026-08-15" } },
  "yuta": { com: { at: "2026-08-15" }, muzzle: { at: "2026-08-15" } },
};
