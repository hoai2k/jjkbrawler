# The pose brief — what every pose has to be

This is the standing brief for drawing a fighter. Everything here was learned by
getting it wrong: each rule below exists because a delivered round missed it and
had to be re-requested, and the round it came from is cited so the reasoning can
be checked rather than taken on faith.

**It is the thing to read before asking for a new character**, and the thing to
add to after every round. A request file describes one delivery and then moves to
history; this file is cumulative, so the roster's twenty-eighth fighter should
arrive closer to right than the twenty-seventh did. When a round turns up a fault
that is not written here yet, write it here — that is the step that makes the
next set better, and it is the one that gets skipped.

- The delivery format — key screen, resolution, file naming — is
  [asset-requests.md § Delivery spec](../../docs/asset-requests.md#delivery-spec).
- The design of a particular fighter is their **character block** in that same
  file, plus their canonical reference image.
- **This file is the pose half.** Prompt formula:
  `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right, `[STYLE SUFFIX]`.

---

## 1. The rules that hold for every pose

**One zoom per character.** Draw every pose of a fighter at the same figure
scale. Do not redraw each pose to fill its canvas. Standing poses should measure
within a few percent of each other; genuinely low poses (crouch, roll, prone) are
shorter because the body is lower, not because the camera moved. This is the most
expensive fault to fix later — it is only catchable by eye, and two idle frames at
different scales make the fighter visibly pulse while standing still.

**Framing, and the reach margin.** Full body inside the frame, margin on all four
sides, nothing touching the canvas edge. The poses that break this are always the
ones that extend: the figure gets drawn to fill the canvas and the weapon is what
falls off. Round 13's `yuta/crouch_attack_b` came back with the blade running off
the right of the plate, which no amount of placement recovers — the sword simply
ends in mid-air. **Draw the margin for the reach, do not shrink the reach to fit
the margin.**

**Facing right**, always. The engine mirrors for the other direction.

**No painted-in motion or effects.** No speed lines, no dust, no afterimages, no
cursed-energy glow that the engine draws itself (`trailStrength`, dash dust,
hit flashes, install auras). Painted effects loop as a flicker and double up on
what the renderer is already doing. A technique's *energy forming in the hands*
is part of the pose; the projectile leaving is not — that is a separate effect
sprite.

**The costume does not change between poses.** Every likeness fault on the roster
has been one pose out of a set drawn from a different reading of the character.
The canonical reference image is the authority, and it is checked pose by pose.

**A pose is not a scene.** One subject per file, no props the character is not
holding, no ground, no background.

**One pose per plate — not a strip of them.** A generator asked for a run frame
will sometimes return the whole cycle as a contact sheet of small figures. It is
unusable twice over: the figures overlap, so no single one crops out cleanly,
and each is a fraction of the canvas, so none of them clears the 600 px body
minimum. Round 15A lost `mechamaru/run_reach_a` this way, and round 22J lost two
`dizzy` frames to the same thing — Miwa's came back as fifteen figures on one
canvas, Haruta's as eleven, and not one figure on either sheet was dizzy. Four
poses means four files; one pose means one figure.

---

## 2. Every `_a`/`_b` pair, and the flip test

Eleven of the poses come in pairs, and the pairs are not two drawings of the same
idea. They are **one motion sampled twice**, and the engine plays them back to
back at a fixed rate, so anything that differs between them other than the motion
reads as a glitch: same camera, same distance, same figure scale, same costume,
same weapon in the same hand.

**The flip test.** Put `_a` beside `_b`. Every part of the body that was moving
must have moved **further in the same direction**. If something reverses, the
pair reads as a twitch; if nothing moves, it reads as a still.

Which kind of pair each one is:

| Pair | What the two frames are |
|---|---|
| `idle_a` / `idle_b` | The same stance a breath apart. Small and organic — a shift of weight, not a second pose. |
| `crouch_a` / `crouch_b` | The same held crouch, breathing. **Not a descent sampled twice.** |
| `run_reach_a` / `run_pass_a` / `run_reach_b` / `run_pass_b` | One continuous stride cycle, four samples. See §4. |
| `attack_light_a` / `_b` | Wind-up, then strike. |
| `attack_heavy_a` / `_b` | Wind-up, then strike, of **one committed blow**. |
| `attack_air_a` / `_b` | The same, airborne. |
| `crouch_attack_a` / `_b` | The same, from the crouch and staying down. |
| `ult_a` / `ult_b` | Gathering, then release. |

A `_b` that is *taller* than its `_a` is a rising attack, and rising attacks are
`attack_up`. That is a different move.

---

## 3. The measurable ones

Three poses now feed numbers the engine uses in play, so they are not only a
readability question — **the art is balance data**. These are the acceptance
criteria, and they can be checked with a ruler:

**Four criteria now, and the fourth is a PAIR rather than a pose.** It joined
this table after round 22B–22D: six of Yaga's and Naoya's wind-ups came back
drawn about as extended as their own strikes, and Kashimo's aerial pair arrived
correct but INVERTED — both drawings good, the two filenames the wrong way
round. The pose lines in §4 have described the coil in detail since round 13
and the deliveries still read the pose NAME.

**The first version of this criterion was wrong, and the way it was wrong is
worth keeping.** It asked that `_a` reach no further forward than the fighter's
own `idle_a` — which sounds right, reads well, and is broken by **135 of the
140 pairs already shipped**, because an idle is square-on with the arms in and
any fighting stance out-reaches it. A criterion nobody measured before writing
it down would have failed the whole roster. The gap between the two frames is
the thing that actually separates the good pairs from the flagged ones.

**Measure them, do not eyeball them.** Round 15A stated the heavy-strike rule in
the request itself and all three delivered sets still missed it — 9%, 16% and
20% against a third. A criterion that is read is not a criterion that is
checked. The measurement is mechanical: the forward edge of the art past the
centre of the body's core columns, as a fraction of the idle's own height, and
it is comparable across a set without any placement because every pose of a
fighter is drawn at one zoom.

| Pose | Criterion | Why |
|---|---|---|
| `attack_heavy_b` | The weapon or fist reaches **further forward than anything in that fighter's own `idle_a`, by at least a third of their standing height**. | Reach is measured off the art (`src/silhouette.js`). A heavy that does not extend is a fighter with short range. |
| `attack_light_b` | Extends past `idle_a` — less far than the heavy, but unmistakably out. | Same measurement. A light attack drawn inside the idle silhouette has no range at all. This is the most re-requested fault on the roster: rounds 11C, 13C and 14A are all this one thing. |
| every attack **pair** | `_b` reaches **further forward than its own `_a`, by at least 0.05 of standing height**. Measured from each frame's own mass centre, so the two are directly comparable. | The same ruler, pointed at the pair rather than at one frame. `_a` is the coil and `_b` is the blow, so the pair has to OPEN; how far either frame reaches on its own is a drawing-style question, and the difference between them is not. Across the shipped roster the median pair opens by 0.10 — and every pair anybody has flagged by hand sits at 0.04 or below, or inverted. `python3 tools/audit_windup.py` measures all 140. |
| `crouch_a` / `crouch_b` | The head drops **by at least a quarter of standing height**. Hips at heel height, thighs closer to horizontal than vertical. | Crouching lowers the hurtbox. A "crouch" with the same shoulder line as the idle is not one, and the player ducks nothing. |
| `idle_a` | A **plain, square-on standing stance** — arms in, weapon held close, nothing spread. | Hurtbox *width* is measured off the idle. A cape thrown wide or a deep three-quarter turn makes that fighter a broader target than intended. Measured across the roster, idle body width ran from 0.21 to 0.50 of standing height, which is drawing style rather than character — the engine currently trusts the measurement only 45% of the way to compensate. |

The idle carries one more consequence: **a fighter's whole sprite set is sized
against their idle** (`docs/character-heights.md`), so redrawing an idle rescales
everything else. Get it right the first time on a new character, and expect a
workbench pass on the whole set if it is ever redrawn.

---

## 4. The pose lines

40 poses, the same semantic set every fighter has (`SEMANTIC_ANIMS`,
`src/characters.js`). Combine each with the fighter's character block. Four
further keys are registered and NOT drawn — `throw_fwd`, `throw_back`,
`throw_up`, `throw_down` each play the heavy attack swung that way, which reads
correctly because a throw is a heave in that direction. Deliver one under those
names and it is picked up with no code change; nobody is owed one.

### Stance

| Pose | Pose line |
|---|---|
| `idle_a` | standing at rest, square on, weight even, guard low but ready, weapon held close to the body — a plain neutral stance with nothing spread wide |
| `idle_b` | the same stance a breath later, chest raised or lowered and one arm shifted slightly — the breathing beat, not a second pose |
| `guard` | braced behind a raised guard, both arms up and in, weight back, head tucked — absorbing rather than attacking |
| `charge` | gathering power on the spot, body coiled and still, energy building but not yet released |

### Movement

The run is **one continuous motion sampled four times** — same camera, same
distance, same figure scale, only the body moves.

| Pose | Pose line |
|---|---|
| `run_reach_a` | sprinting at full stride, torso leaning forward, RIGHT leg extended forward with the heel about to strike, left leg trailing fully behind, LEFT arm swung forward and right arm driven back, body at the lowest point of the stride |
| `run_pass_a` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the left knee driving through to the front, arms passing at the sides, body at the highest point of the stride |
| `run_reach_b` | the mirror of `run_reach_a`: LEFT leg extended forward, right leg trailing, RIGHT arm swung forward |
| `run_pass_b` | the mirror of `run_pass_a`: right knee driving through to the front |
| `dash` | sprinting flat out, body angled forward past the leading foot — a single committed running pose, distinct from the stride cycle |
| `jump_rise` | pushing up off the ground, legs still extending, arms rising, body stretched upward |
| `fall` | descending, legs gathered under the body, arms out for balance, head up |
| `land` | absorbing a landing, knees deeply bent, one hand near the floor — distinct from a crouch, which holds |
| `ledge_hang` | hanging by both hands raised overhead, fingers closed on **nothing** — the body straight below, feet dangling. **Do not draw the ledge.** The stage supplies the edge he is hanging from, so a painted ledge floats in front of the real platform (round 15A, `dagon/ledge_hang`) |
| `dodge_roll` | tucked into a tight roll, knees to chest, arms in, body compact and round — **drawn upright, head up.** The engine spins the sprite through the roll itself, so a pre-rotated drawing rotates twice |
| `dodge_air` | twisting aside in mid-air, body turned out of the line of the blow, limbs pulled in |

**Things that make or break the run cycle**, all learned in round 12B:

- **The lean is constant.** A sprinter's torso holds a steady forward lean
  through the whole cycle. One frame standing tall and the next diving makes the
  loop rock like a see-saw. Take the lean from the fighter's `dash`, dialled
  back, and hold it in all four.
- **Reach low, pass high.** The body genuinely sinks on the contact frames and
  rises on the crossing frames. The engine adds only *half* its usual procedural
  bob when cycle art is present, expecting the art to carry the rest.
- **Weapons ride, they do not flail.** A carried weapon stays in the same hand at
  the same size in all four frames, moving only as far as the arm swings it. The
  most common generator failure on this pose is the prop teleporting between
  hands.
- **Nothing airborne-looking.** Both feet floating with the body rising reads as
  a jump when looped. Toes may leave the ground on the pass frames; the pose has
  to read as *between* steps, not above them.
- **The reach frame reaches with the LEG.** The leading heel is the furthest
  thing forward; the arms only counterbalance it. Dagon's pair came back with
  the arm out in front and the legs under the body, which reads as lunging
  rather than running (round 15A).

### Attacks

| Pose | Pose line |
|---|---|
| `attack_light_a` | winding up a fast strike, striking hand or weapon drawn back beside the body, shoulders coiled away from the target, weight on the back foot, lead arm up as a guard |
| `attack_light_b` | the strike fully extended and travelling forward — arm or weapon at full reach out in front of the body, shoulders rotated through, weight transferred onto the front foot, the drawn-back hand recovered to the chest. **Thrown with the NEAR arm** — the one on the camera side — so the blow is drawn over the body and not behind it |
| `attack_heavy_a` | the wind-up of one committed heavy blow: weapon or fist drawn as far back as the body allows, hips loaded, front foot light |
| `attack_heavy_b` | that blow landing at full extension, hips driven through it, the whole body behind the strike and past its own centre of balance |
| `attack_air_a` | **wind-up, airborne.** Body coiled mid-jump, striking limb cocked, legs gathered |
| `attack_air_b` | **strike, airborne.** Fully extended through the aerial arc, legs trailing, committed |
| `attack_up` | striking upward overhead, body extended and rising with it |
| `attack_down` | striking downward at the ground in front, weight dropping onto it — a committed smash, not a drop |
| `crouch_a` | crouched down low, hips dropped to heel height, thighs closer to horizontal than vertical, back angled forward over the knees, head lowered to about chest height of their standing pose, guard up close to the body |
| `crouch_b` | the same low crouch, weight settled slightly further forward and the head a touch lower, arms shifted — the breathing beat of a held crouch, not a rise out of it |
| `crouch_attack_a` | crouched low as in `crouch_a`, hips at heel height, winding up a strike from that low position — weight loaded onto the back leg, striking hand or weapon drawn back near the floor, both feet planted |
| `crouch_attack_b` | the same low crouch, the strike now extended forward at ankle-to-knee height and travelling further in the direction `_a` was winding — hips rotated through, still down, head no higher than in `_a` |

**For an armed fighter the weapon leads.** The axe head, blade tip or claw is the
furthest thing forward in the frame and clear of the body silhouette. A strike
where the weapon stays inside the body line is the fault behind rounds 11C, 13C
and 14A, and it is the one that costs range in play.

**Hands close on the weapon.** Round 12A was largely one failure: grips that did
not read — fingers not wrapped, a naginata kinking where it crossed the body,
a blade passing through the hand. Draw the hand closed around the haft and the
weapon unbroken across the figure.

### The grab set, and the dash attack

Four poses the roster went without until round 20, and the last four to join the
semantic set. Three are the grab mechanic's (`?throw=true`, `src/grab.js`), one
is the attack a run throws.

| Pose | Pose line |
|---|---|
| `grab_reach` | a committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike — the other arm up as a guard |
| `grab_hold` | gripping an unseen opponent at arm's length by the collar: front hand closed in a fist at chest height, weight planted, body coiled to heave |
| `grabbed` | seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an unseen grip at their own chest |
| `attack_dash` | sprinting forward and striking at the same moment, body low and driving, weight thrown ahead of the leading foot, back leg extended behind, striking arm or weapon fully extended forward along the direction of the run, trailing arm swept back, at the instant of impact |

**What each guide line in the workbench means, because two of the three are not
places to move the drawing to.** `grab_reach` shows the far edge of the box the
game tests (`updateGrabReach`: the fighter's own reach x0.85 plus a closing
grace) — that IS a distance the art should meet, so the grasping hand belongs
ON it; a hand falling well short means the fighter seizes people they visibly
are not touching. The two holding poses show the OTHER body, standing where
`holdGap` pins it, and a grip line halfway between the two — and neither pose
moves to either. The body stays on its own ground contact, because the game
puts it there; what lines up is the HANDS.

**The grip point is the constraint that spans fighters.** `grab_hold`'s closed
fist and `grabbed`'s prying hands must both sit at **chest height on the leading
edge of the body**, because the game draws the two side by side at a fixed gap
(`holdGap` in `src/grab.js`) and the pair is what the player reads. A fist drawn
high on one fighter and low on another makes every crossing of the two look like
they are holding different arguments. Chest height, front edge, both poses,
whole roster — and it is checkable by eye, on the two drawings side by side,
before the round is delivered.

**Do not draw the opponent.** Both grab poses are one figure: the game supplies
the other body. A `grab_hold` drawn with somebody in the fist ships two victims.

**The dash attack is drawn at the heavy's weight.** One drawing serves both the
running light and the running shoulder-charge, so a pose that reads as a light
poke looks weak on half of what it plays. When in doubt, draw the heavy — and
draw the *blow*, not a wind-up: the run was the wind-up, so there is no `_a`/`_b`
pair here and the arm or weapon is already extended along the line of travel.

### Techniques

The fighter's own kit decides what these look like — the technique names are in
`src/characters.js` and on the in-game move list.

| Pose | Pose line |
|---|---|
| `special_neutral` | performing their **neutral special** — the named technique mid-execution, with its cursed energy forming but not yet released |
| `special_side` | their **side special**, moving forward into it |
| `special_down` | their **down special**, weight low, technique breaking out of the ground or the body |
| `ult_a` | the wind-up of their **ultimate**: gathering, energy at maximum, before release |
| `ult_b` | the release of that ultimate, arms and body fully committed |

**Do not draw the technique.** The projectile, the beam, the summoned creature
and the domain are separate effect sprites the engine composites — this pose is
the *fighter casting*, and art that includes the finished technique plays with
two of them on screen.

### Reaction

| Pose | Pose line |
|---|---|
| `hurt` | recoiling from a blow, head snapped back, body compressed, arms thrown out — struck, not falling |
| `dizzy` | stunned on their feet, guard down, body loose and swaying, head lolling |
| `prone` | flat on their back on the ground, arms out, legs dropped, head tilted — dazed but conscious, the beat after being run over. Drawn HORIZONTAL: the body lies along the ground plane, **feet toward the right edge of the frame** |
| `victory` | celebrating, weapon raised or arms up, weight tall and open |

**Say what a costume is NOT, when it could be read two ways.** Uro's block said
her covering was "a wrap of pale-cyan cloud vapour clinging across her chest and
hips" — one sentence that describes a single chest-to-hip garment as readily as
the two separate bands her canon actually shows. Three of her poses came back
with the bands merged into a dress, and they were obeying the words. A costume
with a gap in it needs the gap stated: *two separate bands, midriff bare, never
joined*.

**A minimal costume is at risk in `prone` specifically.** Uro's set draws her
canon cloud wrap over bare limbs correctly in every pose but this one, where she
comes back in a full-length bodysuit that appears in no brief. The figure lying
down full-length is what triggers it — `dodge_roll` is on the ground too and is
fine — so restate the costume **inside the pose line** for any fighter whose
covering is minimal, rather than leaving it to the character block. It may still
come back dressed; that is the generator, not the request.

`prone` is the one pose the placement tools cannot reason about: it lies along
the floor, so its ground contact really is the lowest pixel and the usual foot
rule would hover it. It is named in `NO_STANDING_FOOT` for exactly that reason
and its vertical position is set by eye. Drawing it head-**left**, feet-right is
what keeps the set consistent — five of the twenty-four on the roster are drawn
the other way round and read as sliding the wrong way when knocked down.

---

## 5. The faults that keep coming back

Each of these has cost at least one re-request. They are in rough order of how
often.

| Fault | Where it shows | Round(s) |
|---|---|---|
| **The strike does not extend** | `attack_light_b`, `attack_heavy_b`, `crouch_attack_b` | 11C, 13C, 14A, 22L |
| **The wind-up is already the strike** — `_a` drawn mid-blow, so the pair has no coil and the move has no tell | `attack_light_a`, `attack_heavy_a`, `attack_air_a` | 14A, 17A, 22C, 22D, 22I, 22J |
| **The pair is delivered inverted** — both frames drawn correctly, the two filenames the wrong way round, so the move plays extend-then-retract. **Not a redraw**: point each pose at the other file in the workbench | any `_a`/`_b` pair | 13B, 22B |
| **The crouch is a standing fighting stance** | `crouch_a`, `crouch_b`, both `crouch_attack` frames | 12A, 13A, 13B, 22C, 22L |
| **The costume is a different reading of the character** | any pose, usually a whole sub-batch drawn in one sitting | 10, 12A, 13, 22B |
| **The strike is thrown with the FAR arm** — the limb on the away side, drawn passing behind the collar, so the blow reads as a lean rather than a punch. The near arm is the one the camera is on | `attack_light_b`, `crouch_attack_b` | 22L |
| **Hands do not close on the weapon** | `attack_*`, `run_*` | 12A |
| **`_b` does not finish `_a`** | every pair | 12A, 13B |
| **The reach falls off the canvas** | `crouch_attack_b`, `attack_heavy_b`, `attack_light_b`, `special_neutral`, `teeter` | 13, 22I, 22J |
| **Figure scale drifts between poses** | worst between `idle_a` and `idle_b` | 9, 12B |
| **The technique is drawn into the pose** | `special_*`, `ult_*` | 12A |
| **A design element is silently dropped** | Mahoraga's karma wheel | 13 |
| **A whole cycle arrives as one contact-sheet plate** | `run_*`, `dizzy` | 15A, 22J |
| **Scenery drawn into the pose** — a ledge, a floor, a wall | `ledge_hang` | 15A, 15A(K), 17A |
| **A minimal costume gets covered up when the figure lies down** | `prone` | 13 |
| **An ambiguous costume sentence gets drawn the covered way** | any | 13, 18D |
| **Rewording an ambiguous costume line does not fix it** | Uro's cloud wrap | 18D |
| **The reach frame reaches with the arm** | `run_reach_*` | 15A |
| **The set covers the wrong roster** — right count, wrong names | any roster-wide round | 20C, 20D |

Two of these are worth stating as numbers rather than as complaints, because
that is the difference between a rule somebody reads and a rule somebody checks:
the heavy strike missed its third-of-height reach in **all three** sets round
15A delivered, and it was the *only* stated criterion any of them missed. The
crouches, the light pairs and the idles all landed. Whatever is written as a
measurement gets met; whatever is written as a sentence gets interpreted.

**Round 18 answered every fault in this table that was open**, and its 25
sprites are in the approval queue — whether the rules held is a judgement each
of those decisions makes, pose by pose, not something the delivery itself
settles. What the round *has* already settled is one negative result, and it is
worth as much as a positive one:

**Rewording an ambiguous costume line is not reliably enough.** Uro's block was
rewritten before 18D went out — from *"a wrap of pale-cyan cloud vapour clinging
across her chest and hips"*, which describes a dress as naturally as it does two
bands, to two separate bands with the midriff bare and a single joined garment
called out as wrong. The redraws came back in a costume that was *differently*
wrong rather than closer to canon, and were discarded. So when a costume has
already been drawn wrong twice, tightening the sentence is worth one attempt and
no more; after that the honest move is to keep the drawing that works or change
the pose's framing, and to say so in the request rather than spend a third round
on it. **A costume that a generator is fighting is a limitation to plan around,
not a brief to keep sharpening.**

**Round 20 landed 108 sprites and re-ran none of this table** — no low-resolution
figure, no sheet, no mirrored strike, four clipped canvas edges across the lot,
and the grip point that 20C was written around held on all twenty-seven. What it
did produce is the newest row, and it is not a drawing fault at all:

**A roster-wide round is delivered against `CHARACTER_KEYS`, and the count is
not the check.** 20C and 20D both asked for "27, one per fighter" and both
arrived as 27 files — with Mahoraga in them and **Yuji missing**. Mahoraga is
animated out of a character sprite set and reads like a fighter in the intake
tree, but he is a summon: the roster he is not on is the same list the request
cited. The delivery counted correctly and covered the wrong set, and every
downstream tool agreed with it, because 27 files landing in 27 named directories
is indistinguishable from the right 27 to anything that is not comparing names.
So a roster-wide request should **name the list** rather than its length, and
the intake should diff the delivered directories against `CHARACTER_KEYS` before
the round is called complete. Four sprites of Yuji are what this cost, and they
are the only part of round 20's sprites still open.

The Mahoraga entry has a cause worth naming: **Mahoraga was the only fighter with no
character block**, so his prompts carried no design text at all and the design
lived entirely in a reference image. That works when somebody opens the image and
fails silently when they do not. Every fighter has a block now, and a new
character needs one written *before* the first pose is asked for. A reference
image is not a substitute for the block; it is what the block is checked against.

---

## 6. Adding to this file

The workbench is where faults are found, and the flags carry the reason: a
`needsReplacement` note is one sentence about what is wrong with a drawing. When
a round's flags show the **same** fault on several fighters, that is a rule
missing from this file, not a run of bad luck — write it into §5 and, if it can
be measured, into §3. That is the whole mechanism by which the next set arrives
better than the last one, and it takes about five minutes at the end of a round.

Round intake already ends with "update the request docs"
([assets/intake/README.md](../../assets/intake/README.md), step 9). Updating this
file is part of that step.

**Look at the review boards before importing, not after.** `tools/intake_sheets.py`
renders every delivered plate beside what it replaces, and it is the only step
that catches the faults no measurement will: round 15A's contact-sheet run frame
and its five backwards-mirrored poses were both found there, and both would have
been invisible in the numbers. A mirrored strike in particular still looks like
a perfectly good strike — it just lands behind the fighter.
