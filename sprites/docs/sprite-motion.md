# Sprite motion — making still frames move

## The problem this solves

Of the animation definitions in `src/characters.js`, most resolve to a **single
still frame**. `jump`, `fall`, `dash`, `hurt`, `dizzy`, `shield`, `ledge`,
`dodge_roll`, `dodge_air` and nearly every special are one image held for the
entire state. `idle` is two poses at 2.2 fps; `run` is a four-frame stride
cycle at 13 fps where the round-12 art has landed, and the old two-frame pair
at 10 fps everywhere it has not.

Drawn unchanged, that reads as static in exactly the moments that should have
the most life: a fighter launched across the stage was a rigid pose *sliding*,
a 0.42-second roll never rolled, and a projectile arced across the screen at a
fixed orientation like a sliding decal.

The fix is procedural: derive a draw-time transform from state the simulation
already keeps, so one frame can lean, tumble, breathe and swing. No new art.

**Everything here is draw-time only.** Hurtboxes and hitboxes are computed
independently in `combat.js` from the fighter's position, so none of it can
change what connects.

**Every number you would want to tweak lives in `src/config_tuning.js`** — amplitudes,
tumble thresholds, squash depth, trail length. Nothing in that file is
load-bearing; edit it freely without reading the code that consumes it.

## Where it lives

| File | Role |
|---|---|
| `src/config_tuning.js` | **every hand-tweakable value.** Start here |
| `src/motion.js` | `fighterTransform(f)` → `{rotation, scaleX, scaleY, offsetX, offsetY}` |
| `sprites/src/sprites.js` | anchors, and `drawCharFrame`'s transform support |
| `src/fighter.js` | `updatePresentation()` — steps spin, facing sweep, timers, trail |
| `src/combat.js` | sets `target.spin` on a launch past `TUMBLE_KB_MIN` |
| `src/render.js` | afterimages, the ledge hang, projectile aiming |

Presentation state (`spin`, `spinAngle`, `facingVis`, `landT`, `takeoffT`,
`trail`) lives on the fighter and is stepped on the **fixed 1/60 clock**, after
the hitlag early-return — so it stays deterministic and freezes with the rest
of the fighter during a hit freeze.

## What each state does

| State | Motion |
|---|---|
| Launched (kb > `TUMBLE_KB_MIN`) | tumbles, spin ∝ knockback, unwinds to upright before landing |
| Light hit | flinches away from the blow |
| Roll | a full turn over the action, out of one frame |
| Air dodge | tilts into the dodge and back |
| Airborne | leans into horizontal air speed; stretches into a fast fall |
| Dash / pivot | leans forward / back against the abandoned direction |
| Run | sways once per stride cycle, bobs once per footfall; the bob halves when the four-frame cycle art carries its own rise and fall |
| Idle, crouch | breathes — a slow sway and bob, phase-offset per fighter |
| Shield | trembles, harder as the shield is spent |
| Charging a smash | trembles and shifts, rising with charge |
| Attacks | winds back through startup, whips through active, settles over recovery |
| Landing / takeoff | a ~4% squash / stretch, anchored at the feet |
| Facing flip | sweeps the mirror through side-on over `TURN_TIME` |
| Dash, roll, tumble | afterimages, `TRAIL_LEN` samples deep |

Projectiles point along their velocity; summons sway with their hover and lean
into a lunge.

## Anchors

Rotation needs a pivot. A frame carries named anchor points in
`meta.anchors`, stored as `[x, y]` in the **source image's own pixels**,
measured from its top-left corner.

Image-local coordinates are the whole point. `ox` (horizontal placement),
`bodyBottom` (ground contact) and `renderScale` (size) all move or resize the
art; an anchor expressed this way rides along with it. Put one on a character's
navel and it stays on the navel however the frame is nudged afterwards.

| Anchor | Meaning |
|---|---|
| `com` | Centre of mass — the pivot every rotation turns about. Every frame has one. |
| `ledge` | The hand that grips the edge. The sprite is hung so this point lands on the platform corner. Only on frames used by the `ledge` state. |

An anchor that has never been placed still works: it reports a derived position
(for `com`, the fallback below; for `ledge`, `LEDGE_GRIP_Y_FRAC` down the art),
and the renderer uses it. Placing one by hand only refines it.

Adding another is an entry in `EXTRA_ANCHORS` (`sprites/src/sprites.js`) naming the
states that need it, plus the renderer call that reads it. The workbench builds
its editor from that table, so no UI work is required.

### Where the values come from

`tools/bake_anchors.py` measures each PNG's opaque-pixel centroid offline and
writes it in as `anchors.com`. The centroid is far better than any heuristic on
sprawled, crouched or mid-swing poses — exactly the ones that rotate most —
because it reads the actual pose rather than assuming an upright body.

It is not the whole answer, though, because a centroid assumes **uniform
density** and a human is not uniform. Legs are about a third of body mass but
occupy far more than a third of a standing silhouette's area, so the area
centroid is dragged down into the thighs, below the midsection a body really
pivots about. The script corrects for that with `COM_LIFT_FRAC`, raising the
measured point by 6.5% of the character's height.

That number is measured rather than chosen. Gojo's 28 hand-placed anchors —
dragged from the sprite's centre to his stomach, one pose at a time — are the
reference, and against them the lift halves the raw centroid's error (26 px RMS
against 55) and removes its bias entirely (+0.4 px against +41). It beat both a
flat anatomical fraction and every blend of the two, because the centroid still
carries the pose and a flat fraction throws that away. As a cross-check, the
hand-placed points sit at 0.570 ± 0.053 of body height above the feet, which is
the textbook figure for a standing human.

It measures state anchors too, where a rule can find them: the `ledge` grip is
the centroid of the topmost band of opaque pixels on a hang pose, which is the
raised hand. The `EXTRA` table in that script is where a new rule goes.

```
python3 tools/bake_anchors.py                 # every character, skip hand-placed
python3 tools/bake_anchors.py --only gojo     # one character
python3 tools/bake_anchors.py --force         # re-measure hand-placed anchors too
```

It **never overwrites a hand-placed anchor** without `--force`, so re-running it
after new art lands is safe. Run it whenever frames are added.

Note the flip side: because it skips frames that already carry an anchor, a
change to how the measurement works reaches existing art only under `--force`.
When `COM_LIFT_FRAC` was introduced, the 22 characters holding untouched raw
bakes were re-measured with `--force --only <those characters>`, and Gojo was
left out so his hand-placed values survived. Do the same for the next such
change: check which frames are still raw bakes before forcing anything.

The runtime fallback in `defaultCom` only applies to frames the bake hasn't
reached. It must stay in image pixels: `ox`, `oy`, `bodyBottom` and `centroidX`
are, but **`bodyH` is not** — it is a rendered height used for head-height
comparison, and mixing it in put the pivot hundreds of pixels too low.

## Editing anchors

**Sprite workbench** (`workbench/`) — pick an anchor under *Anchors*, and its
handle appears on the sprite. Drag it on the canvas, nudge it with the arrow
keys or the buttons, or *Reset this anchor* to go back to the measured value.
**Spin preview** rotates the pose about
its centre of mass exactly as the game does: a pivot in the wrong place makes
the body orbit instead of turn, which is instantly obvious.

**Action workbench** (`workbench/?edit=actions`) — *Procedural motion* runs the
real `motion.js` against the fighter state each action implies, so the tumble on
Hurt, the roll on Roll and the swing arc on attacks all play as they do in a
match. *Centre of mass* overlays the pivot.

Both export through the existing flow: **Export all adjustments** →
`tools/apply_sprite_adjustments.py`, which merges anchors per name so exporting
one never drops another. The button downloads the JSON as a file named after
what is in it — `gojo-adjustments.json`, or `roster-adjustments.json` when the
session touched several characters — and also leaves it in the textarea to read
or copy. Nothing is downloaded when nothing has been edited.

## Finding your way around the workbench

Every control's explanation lives on its **title**, as a hover bubble — the
titles that have one carry a small `?`. They used to be paragraphs underneath
each control, which meant a page of prose between you and the slider you wanted;
moving them out took ~350px off the panel. `workbench/tooltip.js` owns this: put
`data-help` on a label and it is wired automatically, including on controls that
are rebuilt as the selection changes.

## Two workbench behaviours worth knowing

**Facing is the game's.** The canvas draws each pose exactly as a match does,
including the mirror applied to art drawn facing left. `nativeLeft` in the
manifest seeded which frames those are, by guess; the **Mirror this pose**
checkbox is the per-frame override, it wins over the list, and it exports with
everything else. Turning a mirror *off* is meaningful and is stored as
`faceLeft: false` rather than by deleting the key.

**Two independent questions get asked about a pose, and they must not be
confused.** Mixing them is a bug that has already been shipped once, so it has
its own regression test (`tools/smoke_workbench.mjs`).

| | question | shows up as | changes when |
|---|---|---|---|
| **Saved state** | had this pose already been dealt with *before the page loaded*? | which view it appears in | you apply an export and reload |
| **Session state** | has it changed *since the page loaded*? | the yellow dot | you edit it |

So the pose list is a **work list that holds still while you work**. Editing a
pose — including flagging its art as needing replacement — never moves it
between views; it only picks up a dot. It leaves the to-do list once your export
has been applied to the manifest and the page reloaded, and not before. Reading
the live manifest to answer the first question is what broke this: the workbench
mutates that object in place, so an in-session flag looked like a committed one
and the pose vanished the instant it was marked.

**The pose list is filtered.** *No saved edits (to do)* — the default — shows the
poses the game draws that nobody has committed an adjustment for yet, so a pass
through a character does not keep re-presenting work already done. *Has saved
edits (done)* is the other half, *Used in game* drops the filter entirely, and
*All* adds the sheet cells the game never draws (the list otherwise shows only
frames an animation names, plus `r0c0`, which `render.js` draws for the respawn
platform).

**The filter never limits what an edit reaches.** Export, the change count and
*Reset character* all read every frame of the character, not the ones the view
happens to show — otherwise switching views would silently drop work from an
export, or leave some behind on a reset.

**Airborne-only poses have no ground contact.** A frame used only by `jump`,
`fall`, `ledge`, `dodge_air` or `airLight` never touches the floor, so the
control is locked — it keeps the detected value. The ground line, platform and
idle ghost stay on screen as a size reference. `AIRBORNE_STATES` in
`sprites/src/sprites.js` is the list.

## What never steps: the smoothness contract

Three mechanisms keep a fighter's drawing from changing by a visible step in
one frame, all added after the game was reported as "flickery, especially near
the edges" — which is where all three faults concentrated, because the ledge is
where states and `grounded` churn fastest. Guarded by `tools/smoke_smooth.mjs`.

- **The COM hold eases across the grounded flip.** An airborne drawing hangs
  from its centre of mass, and applying that hold the frame `grounded` flipped
  was a one-frame vertical jump of 14 px on the roster median
  (`tools/debug/probe_com_pop.mjs`). `fighter.js` ramps `comHoldW` over
  `COM_HOLD_EASE` (0.1 s) instead, and both sprite and flat-blit renderers
  scale the held offset by it (`holdComW`).
- **The teeter exits on the ramp it entered on.** The lean eased in over
  `ledgeLeanIn` and vanished in one frame, because it lived on the teeter POSE
  and the pose flips the instant the stillness gate breaks — which
  micro-adjusting your footing at the lip does constantly. The gate has
  hysteresis (enter under 24 px/s, drop only over 48), `teeterT` decays at 3×
  instead of zeroing, and `motion.js` applies the lean off the timer rather
  than the pose, so it fades out through whatever state comes next.
- **Sprite state changes cross-fade.** The 3D backend blends a state change
  over 0.1 s off the `prevAnim` record `setAnim` keeps; the sprite renderer
  ignored the same record and cut. `render.js` now draws the outgoing frame
  under the new one at falling alpha for `SPRITE_XFADE` (0.08 s) — one extra
  drawImage per fighter for ~5 frames after a switch. Frames stepping *within*
  a loop are not blended: `animTime` only resets on a state change, and the
  snap of limited animation is the style. `hurt` and `land` stay cuts
  (`SPRITE_NO_XFADE`, mirroring the 3D backend's `NO_BLEND_IN`): an impact
  that eases in looks absorbed rather than taken.

## Looking at any of this

`/workbench/?edit=character` puts one fighter on a stage and hands you the pad.
Every action, the roster on arrow keys, a zoom slider, and — bottom left — the
three smoothing mechanisms on switches with a light each:

| Light | What it turns on |
|---|---|
| cross-fade | the fade a state change already ships with (`SPRITE_XFADE`) |
| com align | `?smooth=com` — a fade lines its drawings up by their centre of mass |
| hold fade | `?smooth=holds` — the slow held loops fade their own frame steps |

They are the same flags the URL sets (`src/flags.js`), exported as live bindings
so the switch reaches the renderer on the next frame. That matters more than it
sounds: what any of these three changes is a seam lasting 70–80ms, and nobody
can hold one of those in their head across a page reload. Turning it off while
the fighter is mid-run is the only way to see it.

The bench runs `sim.js stepWorld` and `render.js draw` — the game's own step and
the game's own renderer — so a pose that reads wrong there reads wrong in a
match.

## What a fade cannot fix: the drawings disagreeing

Everything above softens a CUT. None of it can do anything about two drawings
that disagree about how big the fighter is, because a dissolve between a body
7% taller and a body 7% shorter is a smooth dissolve between two differently
sized men — and `?smooth=com`, which does move a body to align a fade, moves it
on the **x axis**. The vertical step is left where it was.

That step is real and it is measurable, because every frame carries its own
`renderScale` and `bodyBottom`: the instant the drawing changes, the head can
move even though the pose did not ask it to.

    node tools/audit_frame_jitter.mjs           # every cycle, worst first
    node tools/audit_frame_jitter.mjs --check   # held cycles only, exit 1 on a pop

It measures the step the way the renderer applies it, which matters: a grounded
pose hangs from its foot line, an airborne one is re-anchored to its centre of
mass by `holdComY` and only leaks what the cap refuses to absorb. Reporting the
raw foot-line difference for a `jump` would be reporting a pop the renderer has
already dealt with.

### The limp, and why it was the one thing safe to fix by arithmetic

A four-frame run is two identical strides on opposite legs. The bob is real —
the body drops onto the reaching foot and rises over the passing one, phased
correctly on 32 of 34 fighters — but the two halves disagreed about how far it
drops, by a median 5% of body height and up to 25%. That is a limp at 6.5
footfalls a second, and it is the highest-frequency thing in the game that
moves when it should not.

It is also the only step here that can be corrected without an opinion, because
**the animation says the same thing twice**: whatever `run_reach_a` means,
`run_reach_b` means it too, so a difference between them carries no intent to
preserve. `tools/smooth_cycles.py` brings each pair to its mean by moving
`renderScale` — which the renderer applies about the frame's own foot anchor,
so the head moves and the feet stay planted. Median step 9.9% → 5.7%, limp
5.1% → 0.0%, and `tools/audit_hitboxes.mjs` reports identical boxes either side
of it: `silhouette.js` takes a banded aggregate over the whole pose set, so a
few percent on four frames cannot move a matchup.

Three fighters are refused rather than averaged — hanami, kurourushi and
mechamaru, whose halves are 20–27% apart. Sorted, the roster's limps run
smoothly from 0.6% to 11.1% and then jump to those three: a gap that big is one
frame being the wrong size, not two halves disagreeing, and splitting the
difference would take the good frame with it. They are printed for an eye
instead, which is the same shape as `XFADE_COM_MAX_FRAC` doubling as
`com_review.js`'s review threshold — cap what a rule may do, queue the rest.

### What is left, and who owns it

| Step | Where | Who can help |
|---|---|---|
| `crouch`, 6.9% of body height at 3fps | the held pair disagreeing about depth — the brief's "not a descent sampled twice" | `?smooth=holds` dissolves the cut; the stature change needs the placement fixing |
| attack pairs, 4–7% (worst 37%) | wind-up to strike | judgement — some of it is the drawing |
| `airLight` and the airborne set, 4.6% | after `holdComY` absorbs what it can | the com anchor, via `com_review.js` |

`--check` fails on held cycles alone and is not in `npm run check` yet, because
34 of them would fail it today — 33 crouch pairs and one idle. It goes in when
they are placed.

## Tuning

All of it is in `src/config_tuning.js`:

- **Tumble too much / too little** — `TUMBLE_SPIN_PER_KB`, `TUMBLE_KB_MIN`,
  `TUMBLE_SPIN_MAX`.
- **Squash & stretch** — `SQUASH` is the master dial (0 disables, 0.5 halves),
  then `SQUASH_DEPTH` per effect.
- **Leans, sway, breathing, swing arcs** — the `MOTION` table.
- **Afterimages** — `TRAIL_LEN`, `TRAIL_STEP`, `TRAIL_ALPHA`, `TRAIL_STRENGTH`.
- **Anchor fallbacks** — `COM_BODY_FRAC`, `LEDGE_GRIP_Y_FRAC`.

Three files are meant for hand editing, and the split is deliberate:

| File | Holds | Affects |
|---|---|---|
| `src/config_menus.js` | roster grouping, every player-facing string | nothing mechanical |
| `src/config_tuning.js` | motion, tumble, squash, trails, DI, move staling | how it feels |
| `src/constants.js` | gravity, jump height, shield economy, blast zones | what the game is |
