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
    // Art not delivered yet (asset request 9G). While this is false Megumi
    // keeps summoning Mahoraga as a separate stalking entity.
    enabled: false,
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
