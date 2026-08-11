# Gameplay TODO — the defensive triangle, and four fairness gaps

Two pieces of work that came out of the round-18 polish review and were
deliberately **not** taken then. The first is a design change with real balance
consequences and wants to be its own round; the second is four small
correctness patches that were held back only so they could land together with
it and be felt as one change.

Nothing here is started. This file is the brief.

---

## 1. A universal grab / throw

### The problem

The game has no answer to a shield.

Shield is finite (`SHIELD_MAX` 100, drain 22/s, so about 4.5 s) and it can be
broken by damage, which is a real cost. But nothing in the game *beats* it on
purpose. In a standard platform fighter the defensive layer is a triangle:

```
attack  beats  grab
grab    beats  shield
shield  beats  attack
```

Take grab out and it collapses into "shield beats attack, attack eventually
beats shield by chipping it down". Holding shield is then never a mistake, only
sometimes slow — and the correct play against pressure is to sit in it and wait
for the attacker to run out of ideas.

Two smaller things make it worse and should be fixed in the same pass:

- **Shield regenerates the instant it drops** (`src/fighter.js`, the shield
  block in `updateFighter`). There is no penalty for tapping in and out of
  shield repeatedly, so the 4.5 s budget is only really 4.5 s of *continuous*
  holding.
- **Dropping shield is free** — no shield-drop lag. So the shield's recovery
  cannot be punished on reaction even when it is read correctly.

`commandGrab` already exists (`src/specials.js`), but it is one character's
special move — an unblockable melee box, not the universal mechanic. It is not
a substitute; it is evidence the shape is missing.

### What to build

A grab on every fighter:

- **Input.** There is no free face button; the pad is fully spoken for. The
  conventional answer is **shield + attack** (LT + X), which is also how a new
  player discovers it by accident, and which reads correctly — you are giving up
  your guard to reach for them.
- **Properties.** Short range, slow startup, and losing to any attack that
  connects first. That losing-to-attack part is not a drawback, it is the whole
  point: it is the third side of the triangle.
- **Ignores shield.** The grab box must test the target's hurtbox and skip the
  shield check entirely — that is the mechanic.
- **Throws.** Four directions at minimum (forward / back / up / down) so the
  grab is a positional tool and not just damage. Down-throw into a juggle and
  up-throw as a kill option at high percent are the two that carry it.
- **Escape.** A mashable grab-release scaled by the victim's damage, so a grab
  at 10% is a combo starter and a grab at 140% is a stock. Without an escape
  the grab is a hard read with no counterplay, which is the failure mode on the
  other side.
- **Teams.** Route the target test through `isFoe` (`src/teams.js`) like every
  other damage path, so a grab cannot pick up a teammate.

### Also in this pass

- **Shield regen delay** — a short beat (~0.4 s) after the shield drops before
  it starts refilling, so tapping shield costs something.
- **Shield-drop lag** — a few frames of recovery on release, so a read on the
  shield drop is punishable.

### Why it was deferred

This changes the balance of every matchup in the game. It wants its own round:
build it, then re-tune shield numbers against it, then play it. Bolting it onto
a polish pass would have shipped an untested triangle, which is worse than a
missing one.

---

## 2. Four fairness and consistency patches

Small, independent, and each one a case where the code does something
inconsistent with what it does everywhere else.

### 2a. Projectiles and summons do not freeze during hitlag

`updateHitboxes` checks the owner's `hitPause` and freezes with them
(`src/combat.js`). `updateProjectiles` does not, and neither does the entity
loop in `src/main.js` — they tick unconditionally.

So the frame a projectile connects, everything freezes for the impact **except
the projectile that caused it**, which visibly slides onward through its own
freeze frames. Same for summons.

**Fix:** the same `owner.hitPause` guard `updateHitboxes` already uses, applied
to `updateProjectiles` and to the entity update. Watch for entities with no
owner (stage gimmicks) — those must keep ticking.

### 2b. Particles and the camera ignore slow motion

`state.slowMo` scales the simulation step in `src/main.js`, but
`updateParticles(dt)` and `updateCamera(dt)` are called with the raw frame dt.

The result is that a KO's slow-motion beat plays at half speed on the *bodies*
and full speed on the *sparks* — the most dramatic moment in the game is the
one place its presentation layers disagree with each other.

**Fix:** pass the same scaled dt the simulation gets. Check the camera
carefully: its smoothing uses `1 - pow(k, dt)`, which is dt-correct, so slowing
its dt slows the follow too — which is probably wanted for the KO shot, but it
should be a decision rather than a side effect.

### 2c. No ledge occupancy

`tryGrabLedge` (`src/fighter.js`) never checks whether somebody is already
hanging on that edge, so two fighters can occupy the same ledge point — they
draw on top of each other and both get the hang timer.

**Fix:** one fighter per ledge. The conventional extra is a **ledge trump** —
grabbing an occupied ledge knocks the current occupant off it — which turns a
bug into a mechanic and is worth doing at the same time.

### 2d. Ledge regrabs are effectively unlimited

The anti-abuse rule is `airT < 0.18`: you must genuinely have left the stage to
grab again. A hit-then-fall cycle satisfies that trivially, so a fighter being
juggled near the ledge can regrab indefinitely.

**Fix:** the standard answer is a **ledge-grab limit per airtime** — a counter
reset on landing (and on being hit hard enough to tumble), with the grab
refused past it. Two or three is the usual number.

---

## Order

2a–2d are independent of each other and of the grab work, and each is small.
1 is the round.
