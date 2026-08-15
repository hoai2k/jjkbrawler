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
//              (combat.js), the chest line an aim solves from (backend.js),
//              and the fallback for art that arrives before the anchor bake
//              has run. The two do not compete — one is per drawing, the other
//              is per fighter.
//
//              IT IS NOT WHAT A 3D MODEL TURNS ABOUT any more. This is a
//              fraction of the DRAWN SPRITE's height, placed by eye on the
//              drawing, and a rig is a different body: Panda's drawing carries
//              its mass at 0.497 of its height and his rig is an ordinary
//              biped whose spine sits at 0.58. render3d/src/loader.js
//              (rigComFrac) measures the model's own spine instead, and
//              camera3d/models.js prefers it, falling back to this for a
//              character with no rig. The value here is still the right one
//              for the drawing, which is what everything else above asks it.
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
 * Cases: stand | crouch | air | hurt | prone | tumble | ledge.
 *
 * `prone` and `tumble` are separate even though the derived box is the same
 * long low shape, because the BODY in it is not: prone is the flat-out drawing
 * resting on the floor, tumble is the hurt pose rotated about the centre of
 * mass as a launched fighter spins (motion.js). They shared a key once, and a
 * fit reviewed on a sprawl was silently reshaping the box a fighter carries
 * through the air.
 *
 * THE EDGE THAT MEETS SOMETHING SOLID IS ADVISORY. combat.js extends a
 * grounded box (stand, crouch, hurt, prone) back DOWN to the foot line
 * whenever the fighter is actually on it, and a hanging box back UP to the
 * platform lip — a leg sweep has to connect with somebody standing in front of
 * it, and an attack over the edge has to connect with somebody hanging off it.
 * So on those cases a fit decides where the box ends in FREE AIR, and the
 * surface decides the other end. `air` and `tumble` touch nothing and are
 * honoured exactly as reviewed.
 *
 * WHEN THE ART MOVES, THE DECISION EXPIRES. A fit is a judgement about a
 * picture, and multipliers survive a re-measure but not a redraw. HURTBOX_FIT_ART
 * below records which drawing each one was reviewed against; src/hurtbox_art.js
 * compares that to the art now, the bench puts a case whose token moved back on
 * the "To do" queue, and tools/audit_hitboxes.mjs names it. The fit goes on
 * applying meanwhile — stale means "ask again", not "throw away".
 */
export const HURTBOX_FIT = {
  "choso": { stand: { w: 0.628, h: 0.968, dx: 0.056, dy: 0.142 }, crouch: { w: 0.805, h: 0.696, dx: 0.145, dy: 0.141 }, air: { w: 0.823, h: 0.607, dx: 0.019, dy: 0.367 }, hurt: { w: 0.816, h: 0.802, dx: 0.021, dy: 0.33 }, prone: { w: 1.472, h: 0.723, dx: 0.037, dy: -0.11 }, ledge: { w: 0.482, h: 0.993, dx: 0.072, dy: 0.383 } },
  "dagon": { stand: { w: 0.782, h: 0.79, dx: 0.065, dy: 0.33 }, crouch: { w: 0.91, h: 0.635, dx: 0.048, dy: 0.109 }, air: { w: 0.654, h: 0.787, dx: 0.079, dy: 0.311 }, hurt: { w: 0.853, h: 0.781, dx: -0.108, dy: 0.265 }, prone: { w: 1.274, h: 1.042, dx: -0.043, dy: -0.018 }, ledge: { w: 0.618, h: 0.912, dx: 0.106, dy: 0.456 } },
  "gakuganji": { stand: { w: 0.716, h: 1.036, dx: -0.15, dy: 0.095 }, crouch: { w: 0.715, h: 0.645, dx: -0.064, dy: 0.153 }, air: { w: 0.646, h: 0.742, dx: 0.035, dy: 0.305 }, hurt: { w: 0.869, h: 0.703, dx: -0.029, dy: 0.381 }, prone: { w: 1.428, h: 0.796, dx: 0.012, dy: -0.096 }, ledge: { w: 0.659, h: 1.151, dx: -0.174, dy: 0.308 } },
  "geto": { stand: { w: 0.844, h: 0.92, dx: 0.029, dy: 0.184 }, crouch: { w: 0.865, h: 0.627, dx: -0.017, dy: 0.093 }, air: { w: 0.686, h: 0.705, dx: 0.154, dy: 0.318 }, hurt: { w: 0.833, h: 0.803, dx: 0.016, dy: 0.222 }, prone: { w: 1.594, h: 0.68, dx: 0.065, dy: -0.014 }, ledge: { w: 0.558, h: 0.979, dx: 0.104, dy: 0.439 } },
  "gojo": { stand: { w: 0.479, h: 0.986, dx: 0.006, dy: 0.134 }, crouch: { w: 0.785, h: 0.606, dx: 0.1, dy: 0.09 }, air: { w: 0.863, h: 0.687, dx: -0.019, dy: 0.279 }, hurt: { w: 1.034, h: 0.58, dx: -0.013, dy: 0.396 }, prone: { w: 1.498, h: 0.508, dx: 0.002, dy: 0.017 }, ledge: { w: 0.454, h: 1.037, dx: -0.045, dy: 0.337 } },
  "hakari": { stand: { w: 0.675, h: 0.833, dx: 0.039, dy: 0.297 }, crouch: { w: 0.864, h: 0.828, dx: 0.029, dy: 0.074 }, air: { w: 0.773, h: 0.678, dx: 0.13, dy: 0.382 }, hurt: { w: 0.859, h: 0.783, dx: -0.011, dy: 0.362 }, prone: { w: 1.66, h: 0.771, dx: 0.015, dy: -0.236 }, ledge: { w: 0.612, h: 0.95, dx: -0.347, dy: 0.509 } },
  "hanami": { stand: { w: 0.872, h: 0.995, dx: -0.01, dy: 0.149 }, crouch: { w: 1.018, h: 0.6, dx: -0.039, dy: 0.116 }, air: { w: 0.996, h: 0.717, dx: 0.032, dy: 0.346 }, hurt: { w: 0.875, h: 0.875, dx: 0.054, dy: 0.287 }, prone: { w: 1.484, h: 0.636, dx: 0.01, dy: -0.03 }, ledge: { w: 0.697, h: 0.954, dx: 0.026, dy: 0.487 } },
  "inumaki": { stand: { w: 0.59, h: 1.025, dx: 0.002, dy: 0.098 }, crouch: { w: 0.879, h: 0.799, dx: 0.06 }, air: { w: 0.829, h: 0.715, dx: 0.087, dy: 0.285 }, hurt: { w: 0.927, h: 0.692, dx: -0.047, dy: 0.314 }, prone: { w: 1.577, h: 0.588, dy: -0.019 }, ledge: { w: 0.675, h: 1.125, dx: -0.03, dy: 0.311 } },
  "jogo": { stand: { w: 0.905, h: 0.86, dx: 0.006, dy: 0.232 }, crouch: { w: 0.901, h: 0.699, dx: 0.028, dy: 0.113 }, air: { w: 1.015, h: 0.8, dx: -0.02, dy: 0.288 }, hurt: { w: 0.939, h: 0.797, dx: -0.151, dy: 0.407 }, prone: { w: 1.821, h: 0.881, dx: 0.072, dy: -0.032 }, ledge: { w: 0.889, h: 1.294, dx: 0.067, dy: 0.546 } },
  "kurourushi": { stand: { w: 0.683, h: 0.94, dx: 0.052, dy: 0.164 }, crouch: { w: 0.947, h: 0.733, dx: 0.027 }, air: { w: 0.736, h: 0.854, dx: 0.027, dy: 0.168 }, hurt: { w: 0.948, h: 0.859, dx: 0.023, dy: 0.292 }, prone: { w: 1.062, h: 1.061, dx: -0.041, dy: -0.063 }, ledge: { w: 0.827, h: 0.829, dx: 0.156, dy: 0.533 } },
  "mahito": { stand: { w: 0.561, h: 0.886, dx: 0.026, dy: 0.258 }, crouch: { w: 0.908, h: 0.582, dx: 0.044, dy: 0.109 }, air: { w: 0.965, h: 0.648, dx: -0.065, dy: 0.36 }, hurt: { w: 0.946, h: 0.708, dx: 0.012, dy: 0.427 }, prone: { w: 1.464, h: 0.615, dx: 0.05, dy: -0.063 }, ledge: { w: 0.622, h: 0.95, dx: 0.007, dy: 0.438 } },
  "maki": { stand: { w: 0.504, h: 0.949, dx: 0.115, dy: 0.18 }, crouch: { w: 0.796, h: 0.654, dx: 0.009, dy: 0.081 }, air: { w: 0.757, h: 0.711, dx: 0.144, dy: 0.31 }, hurt: { w: 0.916, h: 0.814, dx: -0.022, dy: 0.166 }, prone: { w: 1.533, h: 0.615, dx: 0.071, dy: -0.159 }, ledge: { w: 0.408, h: 1.18, dx: -0.008, dy: 0.195 } },
  "mechamaru": { stand: { w: 0.679, h: 1.119, dx: 0.022, dy: 0.018 }, crouch: { w: 1.007, h: 0.782, dx: 0.002 }, air: { w: 0.955, h: 0.789, dx: 0.023, dy: 0.183 }, hurt: { w: 0.933, h: 0.828, dx: -0.043, dy: 0.27 }, prone: { w: 1.498, h: 0.624, dx: -0.015, dy: -0.049 }, ledge: { w: 0.9, h: 1.36, dx: -0.005, dy: 0.241 } },
  "megumi": { stand: { w: 0.573, h: 1.067, dx: -0.03, dy: 0.049 }, crouch: { w: 0.867, h: 0.692, dx: 0.031, dy: -0.001 }, air: { w: 0.827, h: 0.635, dx: 0.056, dy: 0.328 }, hurt: { w: 0.935, h: 0.72, dx: -0.024, dy: 0.266 }, prone: { w: 1.592, h: 0.698, dx: 0.059, dy: -0.184 }, ledge: { w: 0.593, h: 1.013, dx: -0.204, dy: 0.424 } },
  "meimei": { stand: { w: 0.361, h: 0.973, dx: -0.025, dy: 0.183 }, crouch: { w: 0.675, h: 0.685, dx: 0.049, dy: 0.066 }, air: { w: 0.598, h: 0.635, dx: 0.12, dy: 0.436 }, hurt: { w: 0.657, h: 0.698, dx: -0.05, dy: 0.473 }, prone: { w: 1.4, h: 0.511, dx: -0.018, dy: -0.06 }, ledge: { w: 0.444, h: 1.065, dx: -0.011, dy: 0.261 } },
  "momo": { stand: { w: 0.482, h: 0.894, dx: 0.016, dy: 0.256 }, crouch: { w: 0.69, h: 0.649, dx: 0.124, dy: 0.111 }, air: { w: 0.681, h: 0.615, dx: -0.016, dy: 0.334 }, hurt: { w: 0.704, h: 0.685, dx: -0.071, dy: 0.368 }, prone: { w: 1.432, h: 0.705, dx: 0.002, dy: -0.239 }, ledge: { w: 0.469, h: 0.991, dx: -0.036, dy: 0.561 } },
  "nanami": { stand: { w: 0.551, h: 0.948, dx: 0.046, dy: 0.193 }, crouch: { w: 0.739, h: 0.679, dx: 0.033, dy: 0.11 }, air: { w: 0.656, h: 0.61, dx: 0.028, dy: 0.383 }, hurt: { w: 0.99, h: 0.723, dx: -0.006, dy: 0.277 }, prone: { w: 1.467, h: 0.557, dx: -0.023, dy: -0.173 }, ledge: { w: 0.454, h: 1.142, dx: -0.187, dy: 0.356 } },
  "nobara": { stand: { w: 0.606, h: 1.132, dx: 0.021, dy: 0.022 }, crouch: { w: 0.932, h: 0.806, dx: 0.035 }, air: { w: 0.816, h: 0.656, dx: 0.013, dy: 0.336 }, hurt: { w: 1.035, h: 0.714, dx: -0.072, dy: 0.309 }, prone: { w: 1.449, h: 0.508, dx: 0.018, dy: -0.095 }, ledge: { w: 0.549, h: 1.128, dx: -0.049, dy: 0.291 } },
  "panda": { stand: { w: 0.935, h: 1.004, dx: 0.01, dy: 0.109 }, crouch: { w: 0.926, h: 0.76, dx: -0.004, dy: 0.102 }, air: { w: 1.014, h: 0.756, dx: 0.042, dy: 0.292 }, hurt: { w: 1.032, h: 0.793, dx: -0.092, dy: 0.27 }, prone: { w: 1.547, h: 0.918, dx: -0.01, dy: -0.077 }, ledge: { w: 1, h: 1, dx: -0.336, dy: 0.437 } },
  "reggie": { stand: { w: 0.802, h: 0.98, dx: 0.03, dy: 0.14 }, crouch: { w: 0.861, h: 0.654, dx: 0.01, dy: 0.133 }, air: { w: 1.044, h: 0.751, dx: 0.147, dy: 0.3 }, hurt: { w: 1.055, h: 0.779, dx: -0.012, dy: 0.349 }, prone: { w: 1.569, h: 0.558, dx: 0.065, dy: -0.078 }, ledge: { w: 0.691, h: 1.005, dx: -0.04, dy: 0.313 } },
  "sukuna": { stand: { w: 0.732, h: 0.905, dx: 0.015, dy: 0.228 }, crouch: { w: 0.861, h: 0.722, dx: 0.093, dy: 0.133 }, air: { w: 0.959, h: 0.749, dx: 0.105, dy: 0.24 }, hurt: { w: 0.941, h: 0.745, dx: -0.076, dy: 0.308 }, prone: { w: 1.621, h: 0.884, dx: 0.031, dy: -0.256 }, ledge: { w: 0.599, h: 1.157, dx: -0.009, dy: 0.451 } },
  "todo": { stand: { w: 0.853, h: 0.892, dx: -0.003, dy: 0.224 }, crouch: { w: 0.769, h: 0.658, dx: 0.118, dy: 0.155 }, air: { w: 0.786, h: 0.722, dx: 0.139, dy: 0.394 }, hurt: { w: 1.002, h: 0.683, dx: -0.009, dy: 0.41 }, prone: { w: 1.587, h: 0.645, dx: -0.008, dy: -0.108 }, ledge: { w: 0.644, h: 1.183, dx: -0.242, dy: 0.454 } },
  "toji": { stand: { w: 0.628, h: 0.923, dx: 0.037, dy: 0.207 }, crouch: { w: 0.915, h: 0.806, dx: 0.076, dy: 0.147 }, air: { w: 0.607, h: 0.714, dx: 0.142, dy: 0.371 }, hurt: { w: 0.976, h: 0.71, dx: -0.055, dy: 0.393 }, prone: { w: 1.579, h: 0.693, dx: 0.009, dy: -0.15 }, ledge: { w: 0.766, h: 1.193, dx: -0.172, dy: 0.371 } },
  "uro": { stand: { w: 0.593, h: 0.822, dx: 0.049, dy: 0.279 }, crouch: { w: 0.735, h: 0.639, dx: 0.009, dy: 0.028 }, air: { w: 0.545, h: 0.711, dx: 0.026, dy: 0.295 }, hurt: { w: 0.737, h: 0.774, dx: 0.066, dy: 0.404 }, prone: { w: 1.582, h: 0.706, dx: 0.273, dy: -0.144 }, ledge: { w: 0.559, h: 0.775, dx: 0.107, dy: 0.632 } },
  "yuji": { stand: { w: 0.571, h: 1.076, dx: 0.017, dy: 0.028 }, crouch: { w: 1.21, h: 0.899, dx: 0.173 }, air: { w: 0.753, h: 0.658, dx: 0.139, dy: 0.292 }, hurt: { w: 0.951, h: 0.844, dx: -0.011, dy: 0.252 }, prone: { w: 1.587, h: 0.687, dx: 0.004, dy: -0.167 }, ledge: { w: 0.569, h: 1.221, dx: -0.015, dy: 0.191 } },
  "yuki": { stand: { w: 0.628, h: 0.966, dx: 0.048, dy: 0.174 }, crouch: { w: 0.656, h: 0.942, dx: 0.05, dy: 0.02 }, air: { w: 0.662, h: 0.618, dx: 0.112, dy: 0.332 }, hurt: { w: 0.723, h: 0.831, dx: -0.029, dy: 0.305 }, prone: { w: 1.506, h: 0.458, dx: -0.013, dy: -0.009 }, ledge: { w: 0.509, h: 0.959, dx: -0.025, dy: 0.409 } },
  "yuta": { stand: { w: 0.661, h: 1.083, dx: 0.018, dy: 0.042 }, crouch: { w: 0.994, h: 0.868, dx: 0.014, dy: 0.08 }, air: { w: 0.965, h: 0.67, dx: 0.188, dy: 0.447 }, hurt: { w: 0.967, h: 0.866, dx: -0.012, dy: 0.154 }, prone: { w: 1.535, h: 0.542, dx: -0.009, dy: -0.168 }, ledge: { w: 0.624, h: 1.096, dx: -0.168, dy: 0.297 } },
};

/**
 * WHICH DRAWING EACH FIT WAS REVIEWED AGAINST — src/hurtbox_art.js computes
 * these tokens from the frames a case's state resolves to, and everything in
 * the sprite manifest that decides where and how big the body is drawn.
 *
 * Written by the same bench export as HURTBOX_FIT, and only meaningful next to
 * it. A case whose token no longer matches the art is not wrong, it is
 * UNVERIFIED: the queue asks for it again and the audit names it, while the
 * fit carries on applying.
 */
// NOTE — every `ledge` token is deliberately absent, which marks all 27 hang
// fits as wanting another look. They were reviewed on a bench that drew the
// hang pose standing at the foot line; the game hangs it from its `ledge`
// anchor onto the platform corner (render.js anchorTo), which puts the body at
// a different height. The bench draws it correctly now. The fits still apply
// meanwhile — see the note above about stale meaning "ask again".
export const HURTBOX_FIT_ART = {
  "choso": { stand: "15ncm93", crouch: "1az457m", air: "m9z9cy", hurt: "1vcko60", prone: "1tlm9sc" },
  "dagon": { stand: "1yljiy8", crouch: "10lndvc", air: "1ngonbt", hurt: "15i4lj3", prone: "8lfkzw" },
  "gakuganji": { stand: "haqkw6", crouch: "ofy7da", air: "9odvkg", hurt: "1tykwe8", prone: "jktnqb" },
  "geto": { stand: "1o6iom9", crouch: "13irzit", air: "ryppyp", hurt: "s7totq", prone: "1g320hx" },
  "gojo": { stand: "5muvip", crouch: "zeu1gw", air: "chcp6f", hurt: "r9xso3", prone: "1mg4me" },
  "hakari": { stand: "1mmkjol", crouch: "1nodx1j", air: "959mqg", hurt: "oa73dw", prone: "6omo4n" },
  "hanami": { stand: "9bd0dg", crouch: "ukqpea", air: "1yc72yr", hurt: "1c7y902", prone: "1sa0qnj" },
  "inumaki": { stand: "mfotwa", crouch: "oxw2l3", air: "87gu1i", hurt: "1el5mls", prone: "8ox7fc" },
  "jogo": { stand: "11gsthh", crouch: "l4c4gc", air: "j8vfmi", hurt: "1tcdqxv", prone: "1usfcfm" },
  "kurourushi": { stand: "15plnzo", crouch: "xzmve2", air: "jflk6p", hurt: "1tfjdjt", prone: "gkmsbr" },
  "mahito": { stand: "pri1gz", crouch: "1fnddsy", air: "1nbh61w", hurt: "juspbl", prone: "w6f8fp" },
  "maki": { stand: "8je4q4", crouch: "1s74gad", air: "ynfhb5", hurt: "wz6105", prone: "j5e0rk" },
  "mechamaru": { stand: "dqvtyi", crouch: "k42cqv", air: "ags6fv", hurt: "ahslvw", prone: "11g8eft" },
  "megumi": { stand: "y2yi98", crouch: "jah0x7", air: "219gjf", hurt: "qa1o2l", prone: "16b7nhi" },
  "meimei": { stand: "sn0zct", crouch: "2vtsm0", air: "16e3wfc", hurt: "1e6ykbb", prone: "d0my7d" },
  "momo": { stand: "q5h5ph", crouch: "9izcpv", air: "ksj1kj", hurt: "f9kxw1", prone: "6lmpt9" },
  "nanami": { stand: "cdriyc", crouch: "oabja3", air: "1bitsev", hurt: "1a862zw", prone: "lc3tva" },
  "nobara": { stand: "waefjz", crouch: "anccd3", air: "6e00w1", hurt: "1k32qr", prone: "w2f9ce" },
  "panda": { stand: "1r74aqf", crouch: "io9xdk", air: "13ql5oz", hurt: "k0p1xz", prone: "1mkrpjb" },
  "reggie": { stand: "spsmjs", crouch: "19xvwoh", air: "mvbmms", hurt: "1lkum7w", prone: "9byuav" },
  "sukuna": { stand: "u8ixaj", crouch: "1qmjonv", air: "jj1my8", hurt: "1ichxo7", prone: "8b4sz4" },
  "todo": { stand: "mpjcqi", crouch: "1cxi6pd", air: "2a2lzt", hurt: "17xfyrk", prone: "8931yw" },
  "toji": { stand: "4xrnc", crouch: "2bo18", air: "bsy1vu", hurt: "12rlhsj", prone: "h6kbox" },
  "uro": { stand: "ag39dg", crouch: "t5kuhw", air: "hz25yd", hurt: "1n51oqe", prone: "183asyu" },
  "yuji": { stand: "1bldntr", crouch: "1h5sxd", air: "obtqav", hurt: "1nurhs6", prone: "az45hh" },
  "yuki": { stand: "clzz05", crouch: "datvjf", air: "3sit9g", hurt: "1gnrhre", prone: "1kiuf20" },
  "yuta": { stand: "1vr76si", crouch: "1pnud9y", air: "hn953f", hurt: "1ljznat", prone: "1g7midt" },
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
