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
 *
 * `prone` does double duty: combat.js builds the same box for a fighter lying
 * flat AND for one tumbling near horizontal in mid-air, which is the same body
 * spun. The bench reviews it on the flat drawing, so a prone fit is also a
 * tumble fit — worth knowing before widening one to cover a sprawl.
 */
export const HURTBOX_FIT = {
  "inumaki": { stand: { w: 0.59, h: 1.025, dx: 0.002, dy: 0.098 }, crouch: { w: 0.879, h: 0.799, dx: 0.06 }, air: { w: 0.829, h: 0.715, dx: 0.087, dy: 0.285 }, hurt: { w: 0.927, h: 0.692, dx: -0.047, dy: 0.314 }, prone: { w: 1.577, h: 0.588, dy: -0.019 }, ledge: { w: 0.675, h: 1.125, dx: -0.03, dy: 0.311 } },
  "maki": { stand: { w: 0.504, h: 0.949, dx: 0.115, dy: 0.18 }, crouch: { w: 0.796, h: 0.654, dx: 0.009, dy: 0.081 }, air: { w: 0.757, h: 0.711, dx: 0.144, dy: 0.31 }, hurt: { w: 0.916, h: 0.814, dx: -0.022, dy: 0.166 }, prone: { w: 1.533, h: 0.615, dx: 0.071, dy: -0.159 }, ledge: { w: 0.408, h: 1.18, dx: -0.008, dy: 0.195 } },
  "mechamaru": { stand: { w: 0.679, h: 1.119, dx: 0.022, dy: 0.018 }, crouch: { w: 1.007, h: 0.782, dx: 0.002 }, air: { w: 0.955, h: 0.789, dx: 0.023, dy: 0.183 }, hurt: { w: 0.933, h: 0.828, dx: -0.043, dy: 0.27 }, prone: { w: 1.498, h: 0.624, dx: -0.015, dy: -0.049 }, ledge: { w: 0.9, h: 1.36, dx: -0.005, dy: 0.241 } },
  "megumi": { stand: { w: 0.573, h: 1.067, dx: -0.03, dy: 0.049 }, crouch: { w: 0.867, h: 0.692, dx: 0.031, dy: -0.001 }, air: { w: 0.827, h: 0.635, dx: 0.056, dy: 0.328 }, hurt: { w: 0.935, h: 0.72, dx: -0.024, dy: 0.266 }, prone: { w: 1.592, h: 0.698, dx: 0.059, dy: -0.184 }, ledge: { w: 0.593, h: 1.013, dx: -0.204, dy: 0.424 } },
  "nobara": { stand: { w: 0.606, h: 1.132, dx: 0.021, dy: 0.022 }, crouch: { w: 0.932, h: 0.806, dx: 0.035 }, air: { w: 0.816, h: 0.656, dx: 0.013, dy: 0.336 }, hurt: { w: 1.035, h: 0.714, dx: -0.072, dy: 0.309 }, prone: { w: 1.449, h: 0.508, dx: 0.018, dy: -0.095 }, ledge: { w: 0.549, h: 1.128, dx: -0.049, dy: 0.291 } },
  "panda": { stand: { w: 0.935, h: 1.004, dx: 0.01, dy: 0.109 }, crouch: { w: 0.926, h: 0.76, dx: -0.004, dy: 0.102 }, air: { w: 1.014, h: 0.756, dx: 0.042, dy: 0.292 }, hurt: { w: 1.032, h: 0.793, dx: -0.092, dy: 0.27 }, prone: { w: 1.547, h: 0.918, dx: -0.01, dy: -0.077 }, ledge: { w: 1, h: 1, dx: -0.336, dy: 0.437 } },
  "todo": { stand: { w: 0.853, h: 0.892, dx: -0.003, dy: 0.224 } },
  "yuji": { stand: { w: 0.571, h: 1.076, dx: 0.017, dy: 0.028 }, crouch: { w: 1.21, h: 0.899, dx: 0.173 }, air: { w: 0.753, h: 0.658, dx: 0.139, dy: 0.292 }, hurt: { w: 0.951, h: 0.844, dx: -0.011, dy: 0.252 }, prone: { w: 1.587, h: 0.687, dx: 0.004, dy: -0.167 }, ledge: { w: 0.569, h: 1.221, dx: -0.015, dy: 0.191 } },
  "yuta": { stand: { w: 0.661, h: 1.083, dx: 0.018, dy: 0.042 }, crouch: { w: 0.994, h: 0.868, dx: 0.014, dy: 0.08 }, air: { w: 0.965, h: 0.67, dx: 0.188, dy: 0.447 }, hurt: { w: 0.967, h: 0.866, dx: -0.012, dy: 0.154 }, prone: { w: 1.535, h: 0.542, dx: -0.009, dy: -0.168 }, ledge: { w: 0.624, h: 1.096, dx: -0.168, dy: 0.297 } },
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
