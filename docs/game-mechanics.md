# JJK Brawler II — Game Mechanics

This document is the design reference for the battle system. Numbers here match
the implementation (`src/constants.js`, `src/moves.js`, `src/combat.js`,
`src/fighter.js`); if code and doc disagree, the code is newer.

The goal of v2 was a **complete platform-fighter core in the spirit of Super
Smash Bros.**: percent damage with scaling knockback, stocks and blast zones,
a full defensive layer (shield / parry / three kinds of dodge), expressive
movement (dash, short hop, double jump, fast fall, ledge play), a light/heavy
attack split with directional variants, three signature specials per character,
and a meter-funded ultimate for every fighter.

---

## 1. The percent & knockback model

- Fighters accumulate **damage percent** (0–999%). Damage never KOs by itself.
- Every hit computes a **knockback impulse**:

  ```
  kb = (baseKb + victimPercent × growth) / victimWeight
  ```

  `baseKb` is the move's raw launch power, `growth` is how hard the move scales
  with the victim's percent, and `weight` (0.88 Momo → 1.28 Panda) divides the
  result. The victim is launched at the move's angle (radians; negative angles
  are **spikes** that launch airborne victims downward).

- **Hitstun** scales with knockback: `0.12 + kb × 0.00048` seconds plus any
  stun bonuses (Cursed Speech), hard-capped at 1.35 s. Launched fighters can't
  act until it ends.
- **KOs** happen only at blast zones: past the sides (−300 / 1580), the top
  (−420, for vertical KOs), or the bottom (1000). Losing a stock resets percent,
  and the fighter respawns above their start point with 2.1 s of invincibility.
- **Hitlag** (freeze frames): both fighters freeze for `0.03 + damage × 0.0045`
  seconds on contact (25% longer on heavies) while the victim vibrates — this
  is the "crunch" that makes hits read. The world also gets brief **slow-mo**
  and a camera **zoom kick** on knockouts and heavy launches.

## 2. Movement

| Mechanic | Detail |
|---|---|
| Run | Per-character top speed (356–468 px/s) and acceleration |
| **Dash** | Double-tap a direction within 0.24 s → 1.45× burst for 0.22 s |
| Turn lock | Reversing at speed costs 0.08 s of traction — spacing has commitment |
| Jump | Per-character impulse; **short hop** by releasing jump within ~0.09 s |
| Double jump | One air jump at 92% power (Momo gets two — broom flight) |
| Jump buffer / coyote time | 0.15 s buffer, 0.10 s coyote window |
| **Fast fall** | Press down while airborne: fall cap rises 1.62× |
| Crouch | Shrinks the hurtbox; ducks under high projectiles |
| Platform drop | Down + jump drops through side/top platforms (not the main stage) |

### Ledges
Only the main platform has grabbable ledges. Falling near an edge (after real airtime —
no walk-off regrab loops) snaps the fighter to a hang (brief invincibility,
refreshed double jump); getting hit knocks them off the hang. From the hang:
climb (toward), **ledge roll** (shield — long invulnerable climb), **ledge
jump** (jump), **ledge attack** (attack — climbs and swings), or drop (down/away).
Hanging times out after 2.8 s so ledges can't be camped.

## 3. Defense

- **Shield** (hold): a health bubble (100 HP) that shrinks as it drains.
  Blocking costs `damage × 1.5 × moveShieldMultiplier` shield HP; holding it
  leaks 22 HP/s; it regenerates at 14 HP/s while down. At 0 HP the shield
  **breaks**: 2.2 s dizzy stun — a guaranteed punish and usually a stock.
- **Parry**: a shield raised within **0.12 s** of the hit blocks for free — no
  shield damage, the attacker is frozen for 0.34 s, and the parrier gains
  6 meter. Only a *fresh* raise counts (the shield must have been down for
  0.25 s first), so mashing the button never parries. Blocking a hit does not
  drop the shield: it stays up through shield-stun against multi-hit strings.
- **Shield pressure**: heavy attacks carry 1.5–2.2× shield multipliers; Maki's
  cursed tools (+18 flat) and Toji's Heavenly Restriction arsenal (+14 flat)
  shred shields; some moves (Panda's Drumming Beat, command grabs, many
  ultimates) are **unblockable**.
- **Dodges** (all share a staleness rule — each dodge within 1.4 s of the last
  loses 25% of its invincibility, so wiggling is punishable):
  - **Roll** (shield + side): ~210 px of movement, invincible start.
  - **Spot dodge** (shield + down): stay in place, longest invincibility.
  - **Air dodge** (shield in midair, once per airtime): brief invincibility
    plus directional drift — also a recovery mixup.

## 4. Offense

Every character shares the same **input grammar**; the numbers and effects are
per-character (from their `light`/`heavy` profiles in `src/characters.js`).

### Light attacks (fast, low commitment)
- **Jab combo** — neutral light on the ground: two quick hits into a knockback
  finisher.
- **Side tilt** — light while moving/dashing: the character's spacing poke.
- **Up tilt** — light + up: anti-air arc.
- **Down tilt** — light while crouching: low poke, slight launch.
- **Aerials** — neutral / up / **down air** in midair; down airs are
  **spikes** that launch downward — the edge-guard finisher.

### Heavy attacks (slow, chargeable, shield-hungry)
- Hold heavy to **charge** up to 0.8 s → up to +55% damage and +25% launch.
- **Side smash** — the KO button. **Up smash** — vertical KO. **Down smash**
  ("quake") — hits both sides along the ground. One **air heavy**.

### Specials & ultimates
Three specials per character (neutral / side+special / down+special) built from
shared primitives — projectiles, ground waves, dash strikes, traps, counters,
command grabs, installs, teleports, gambles — plus bespoke signature logic
(Boogie Woogie's swap, Cursed Speech's throat strain, the Gorilla core, etc.).
Specials have individual cooldowns (0.8–7 s) instead of resource costs.

**Cursed Energy meter** (0–100): builds from dealing damage (×0.5), taking
damage (×0.85), and slowly over time (+1.1/s). At 100, the ultimate button
spends it all on the character's **cinematic ultimate** — a domain, a meteor,
an install transformation, a flurry rush. Ultimates are the comeback valve:
getting beaten up funds yours faster.

A full bar is also exactly what a **Domain Expansion** costs, so the seven
fighters who have one spend every filled bar on a choice: fire the ultimate
now, or open the domain instead. Nobody gets both off one bar.

## 5. Status effects

| Effect | Source | What it does |
|---|---|---|
| Burn | Jogo, Sukuna's Fuga | % ticks for 2.6 s (Jogo's burn 50% hotter) |
| Bleed | Sukuna | % ticks for 3.2 s, only while moving fast |
| Snare | Megumi, Hanami, Inumaki | Movement slowed to 60% |
| Soul Mark | Mahito | +18% damage taken from everything for 3.4 s |
| Nail Mark | Nobara | Stacking marks that Hairpin/Resonance consume |
| Silence | Toji | Specials sealed for 3 s |
| Gust | Momo | Extra pushback and lift |
| Armor | Panda, installs | No hitstun/knockback from hits (damage still counts) |

Maki's Heavenly Restriction makes her **immune** to burn, snare, soul marks,
and cursed speech — a body with no cursed energy to curse.

## 6. Stages & camera

All 20 arenas from v1 return: one solid main platform with grabbable ledges
plus three drop-through platforms, each with its own painted backdrop and
color grade. The camera is dynamic Smash-style: it tracks the fighters'
midpoint and zooms with their separation (1.0×–1.18×), shakes with impact,
and punches in on KOs.

### Active Boards

Every stage also has a **gameplay identity** (`src/stage_fx.js`), toggled by
**Settings → Active Boards** (default on; off restores the static v1 layouts).
Design rules: hazards deal 4–8% with light, inward/upward knockback (never a
spike), everything dangerous is telegraphed ≥1 s, ledges always work, and a
hazard can never KO by itself. The CPU steps out of telegraphed zones.

| Stage | Identity |
|---|---|
| Training Bridge | None — the fair one (cosmetic leaves only) |
| Quiet Hall | Silence bell: every ~25 s a 4 s hush seals all specials |
| Flooded Gate | Surge wave sweeps the floor; pushes, never damages |
| Shibuya Night | A curtain falls for 8 s: everyone's meter builds fast |
| Curse Maw | Fangs snap up at both floor edges (7%) — centre is safe |
| Garden Steps | Terraced staircase layout; a flower blooms — first touch heals 8% |
| Lantern Corridor | A lantern falls and burns a patch of floor |
| Sunken Crossing | Slick: friction drops sharply, stops become slides |
| Neon Split | A centre energy wall for 5 s; crossing costs 6% |
| Bone Sanctum | Drop-through platforms rattle, then phase intangible |
| Bridge Duel | The whole main platform drifts ±70 px (ledges ride along) |
| Academy Hall | Class bell: platforms glide between four arrangements |
| Mist Pier | Fog hides both fighters as silhouettes for 6 s |
| Crosswalk Rush | Telegraphed light-trail traffic at ground level (5%) |
| Cursed Teeth | Falling fangs on shadow telegraphs + a gentle inhale pull |
| River Gate | Alternating crosswind drifts airborne fighters (petals show it) |
| School Wing | A weak curse wanders: pop it for +8 meter, or it latches (4%) |
| Empty City | The top platform crumbles under weight, reforms in 5 s |
| Billboard Roof | After two flashes, lightning strikes the top platform (8%) |
| Domain Core | 0.88× gravity; side platforms orbit slowly |

## 7. Match structure & options

- Stock battle: 1 / 2 / 3 / 5 stocks (default 3).
- **VS CPU** (Easy / Normal / Hard — reaction time, aggression, defense, and a
  damage handicap all scale) or **2 players local**. Gamepads supported
  (first pad = P1, second = P2).
- Pause (Space/Esc/Start), Move List in the pause menu, hitbox debug on `` ` ``.

## 8. Controls

| Action | P1 | P2 | Gamepad |
|---|---|---|---|
| Move | A / D | ◀ / ▶ | Stick / D-pad |
| Jump | W | ▲ | A |
| Crouch / fast-fall | S | ▼ | Down |
| Light attack | J | , | X |
| Heavy attack (hold = charge) | K | . | Y |
| Special | L | / | B |
| Ultimate | I | ' | LB / RB |
| Shield / dodges | Left Shift | Right Shift | Triggers |
| Pause | Space / Esc | — | Start |

## 9. Hitboxes vs. visuals

Universal attack hitboxes are derived from each character's `reach` profile and
then scaled to the sprites: the sheet art physically caps visible reach at
~94 px in front of a fighter, so `moves.js` applies `REACH_SCALE` so that hit
ranges land at the visuals plus a small grace margin. Hold `` ` `` in a match to
see live hitboxes (red) and hurtboxes (white).

Sprite placement itself is normalized offline (`tools/extract_sprites.py`):
per-frame foot anchoring, per-frame facing correction (the sheets mix left- and
right-facing art), and hand-curated `renderScale` entries for cells drawn at a
different zoom than the character's standing art.
