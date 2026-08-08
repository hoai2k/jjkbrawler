// ---------------------------------------------------------------------------
// Ultimate transformations — a fighter becoming something else for a while,
// rather than summoning it as a separate entity.
//
// A transformation swaps the fighter's whole sprite set for another actor's
// (SPRITE_ACTORS in characters.js) for the duration of an install, and applies
// that actor's stat modifiers. The fighter keeps their own kit and controls;
// only the body changes.
//
// Each entry is gated on `enabled` AND on its art actually being present, so a
// transform whose sprites have not been delivered silently keeps the old
// behaviour instead of drawing nothing. Flip `enabled` once the poses are in
// assets/sprites/<actor>/ and registered in manifest.json — see
// transformReady() in ultimates.js for the check.
// ---------------------------------------------------------------------------

// Every pose a transformed fighter can be asked to draw. A set missing any of
// these would pop holes mid-fight, so the readiness check demands all of them.
export const TRANSFORM_POSES = [
  "idle_a", "idle_b", "run_a", "run_b", "dash", "jump_rise", "fall", "land",
  "hurt", "crouch_a", "crouch_b", "crouch_attack_a", "crouch_attack_b",
  "guard", "ledge_hang", "dodge_roll", "dodge_air",
  "attack_light_a", "attack_light_b", "attack_heavy", "attack_up", "attack_down",
  "attack_air", "charge", "special_neutral", "special_side", "special_down",
  "ult_a", "ult_b", "dizzy", "victory",
];

export const TRANSFORMS = {
  // Megumi's ultimate. Canon-wise the Ten Shadows user does not become
  // Mahoraga — but as a fighting-game ultimate, wearing the shikigami reads
  // far better than watching one walk around beside you, and it puts the
  // player in control of the payoff instead of spectating it.
  mahoraga: {
    // Whose ultimate this is. The loader reads it to fetch the actor's art
    // alongside that fighter's, because a transform into a sprite set nobody
    // downloaded draws nothing and the fighter disappears for the duration.
    fighter: "megumi",
    // On since round 9G delivered all 31 poses. Megumi now BECOMES Mahoraga
    // for the duration and the player drives him; the separate stalking entity
    // in ultimates.js is the fallback for a set that fails transformReady().
    //
    // The art is flagged for redraw in round 11 — it does not match the
    // shikigami's canon design — but a transform in art that needs work still
    // plays better than watching a summon walk around beside you, so this is
    // not waiting on that.
    enabled: true,
    actor: "mahoraga",
    label: "MAHORAGA",
    color: "#e8ecf8",
    // Modifiers applied for the duration, on top of the ultimate's own params.
    install: {
      dmgMul: 1.35,
      speedMul: 0.88,
      dmgTakenMul: 0.7,
      armor: true,
    },
  },
};

/** Actors a fighter can turn into, so their art can be loaded with the
 *  fighter's own. Only transforms that are switched ON count: a disabled one
 *  never runs, and fetching its set would be a download for nothing. */
export function transformActorsFor(fighterKey) {
  return Object.values(TRANSFORMS)
    .filter((t) => t.enabled && t.fighter === fighterKey)
    .map((t) => t.actor);
}
