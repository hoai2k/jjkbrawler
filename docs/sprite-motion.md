# Sprite motion — making still frames move

## The problem this solves

Of the animation definitions in `src/characters.js`, most resolve to a **single
still frame**. `jump`, `fall`, `dash`, `hurt`, `dizzy`, `shield`, `ledge`,
`dodge_roll`, `dodge_air` and nearly every special are one image held for the
entire state. `idle` is two poses at 2.2 fps; `run` is two at 10 fps.

Drawn unchanged, that reads as static in exactly the moments that should have
the most life: a fighter launched across the stage was a rigid pose *sliding*,
a 0.42-second roll never rolled, and a projectile arced across the screen at a
fixed orientation like a sliding decal.

The fix is procedural: derive a draw-time transform from state the simulation
already keeps, so one frame can lean, tumble, breathe and swing. No new art.

**Everything here is draw-time only.** Hurtboxes and hitboxes are computed
independently in `combat.js` from the fighter's position, so none of it can
change what connects. `SQUASH = 0` in `constants.js` disables squash & stretch
outright; the amplitude table at the top of `motion.js` dials the rest.

## Where it lives

| File | Role |
|---|---|
| `src/motion.js` | `fighterTransform(f)` → `{rotation, scaleX, scaleY, offsetX, offsetY}` |
| `src/sprites.js` | anchors, and `drawCharFrame`'s transform support |
| `src/constants.js` | tumble thresholds, `SQUASH`, trail length, turn time |
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
| Run | sways and bobs once per frame of the cycle |
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

Adding another is an entry in `EXTRA_ANCHORS` (`src/sprites.js`) naming the
states that need it, plus the renderer call that reads it. The workbench builds
its editor from that table, so no UI work is required.

### Where the values come from

`tools/bake_anchors.py` measures each PNG's opaque-pixel centroid offline and
writes it in as `anchors.com`. For uniform density that centroid *is* the centre
of mass, and it is far better than any heuristic on sprawled, crouched or
mid-swing poses — exactly the ones that rotate most.

```
python3 tools/bake_anchors.py                 # every character, skip hand-placed
python3 tools/bake_anchors.py --only gojo     # one character
python3 tools/bake_anchors.py --force         # re-measure hand-placed anchors too
```

It **never overwrites a hand-placed anchor** without `--force`, so re-running it
after new art lands is safe. Run it whenever frames are added.

The runtime fallback in `defaultCom` only applies to frames the bake hasn't
reached. It must stay in image pixels: `ox`, `oy`, `bodyBottom` and `centroidX`
are, but **`bodyH` is not** — it is a rendered height used for head-height
comparison, and mixing it in put the pivot hundreds of pixels too low.

## Editing anchors

**Sprite workbench** (`workbench/`) — pick an anchor under *Anchors*, and its
handle appears on the sprite. Drag it on the canvas, nudge it with the arrow
keys or the buttons, or *Reset to auto*. **Spin preview** rotates the pose about
its centre of mass exactly as the game does: a pivot in the wrong place makes
the body orbit instead of turn, which is instantly obvious.

**Action workbench** (`workbench/?edit=actions`) — *Procedural motion* runs the
real `motion.js` against the fighter state each action implies, so the tumble on
Hurt, the roll on Roll and the swing arc on attacks all play as they do in a
match. *Centre of mass* overlays the pivot.

Both export through the existing flow: **Export all adjustments** →
`tools/apply_sprite_adjustments.py`, which merges anchors per name so exporting
one never drops another.

## Two workbench behaviours worth knowing

**Unused poses are hidden.** The sheets carry cells the game never draws; the
pose list shows only those an animation names (plus `r0c0`, which `render.js`
draws directly for the respawn platform). *View all sprites* reveals the rest.

**Airborne-only poses have no ground contact.** A frame used only by `jump`,
`fall`, `ledge`, `dodge_air` or `airLight` never touches the floor, so the
control is locked — it keeps the detected value. The ground line, platform and
idle ghost stay on screen as a size reference. `AIRBORNE_STATES` in
`src/sprites.js` is the list.

## Tuning

- **Tumble too much / too little** — `TUMBLE_SPIN_PER_KB`, `TUMBLE_KB_MIN`,
  `TUMBLE_SPIN_MAX` in `constants.js`.
- **Squash & stretch** — `SQUASH` (0 disables), then the `S` table in
  `motion.js`.
- **Everything else** — the `A` amplitude table at the top of `motion.js`.
