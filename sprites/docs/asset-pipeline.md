# Asset Pipeline — Sprite Extraction

## The problem with the v1 sheets

The original game shipped seventeen 1254×1568 character sheets on a 4×5 grid
(cell ≈ 313.5×313.6 px; rows: idle / run / air / techniques / crouch). The art
inside those cells is imprecise in ways that hurt a fighting game:

1. **Cell bleed** — weapons and effect trails cross cell borders (Maki's
   naginata, Gojo's energy trails). A naive grid crop cuts sprites apart *and*
   pastes fragments of neighbors into the wrong frames. v1 worked around this
   at runtime by scrubbing one pixel of border and binarizing alpha, which
   trimmed legitimate art along with the bleed.
2. **Inconsistent foot lines** — characters stand at slightly different
   heights per frame, so a fixed pivot makes idle/run animations bob. v1
   re-detected feet at runtime by scanning alpha rows per frame.
3. **Soft alpha halos** — leftover semi-transparent fringing from the original
   background removal.

## The v2 approach: transfer sprites individually

`tools/extract_sprites.py` rebuilds the assets offline instead of patching
them at runtime:

1. **Connected-component labeling** (scipy, 8-connectivity) over each sheet's
   alpha channel — every blob of art becomes an addressable component.
2. **Majority-cell assignment** — each component belongs to the grid cell
   containing most of its pixels. A weapon tip that pokes into the next cell
   stays with the body it's connected to; a detached energy burst stays with
   the frame it overlaps most.
3. **Fragment rules** — detached fragments hanging almost entirely below their
   cell's bottom edge are reassigned to the frame beneath (the sheets' rows
   overlap slightly); per-frame overrides handle known one-offs (e.g. a stray
   mandala arc under Inumaki's landing frame).
4. **Per-frame trimmed PNGs** — every frame is composited from exactly its own
   components (foreign pixels inside the bounding box are excluded), trimmed
   tight, and written to `sprites/assets/<char>/r<row>c<col>.png`.
5. **Manifest** — `sprites/assets/manifest.json` records each frame's size,
   its offset relative to the logical cell (so frames can legitimately
   overhang their cell), and two derived anchors:
   - `bodyBottom`: the bottom of the frame's *largest* component — the foot
     line, unpolluted by detached effects. The renderer pins this to the
     fighter's ground Y, which kills animation bobbing without runtime pixel
     scans.
   - `centroidX`: alpha-weighted center of mass, kept for debugging.

Individually generated replacement cells are listed in
`GENERATED_FRAME_TARGETS`. The extractor preserves those high-resolution alpha
PNGs at their final paths and rebuilds sheet-compatible anchors and render
scales from their alpha bounds, so a historical sheet re-extraction cannot
restore the broken art.

The engine (`sprites/src/sprites.js`) draws a frame by translating to the fighter's
feet, flipping by facing, and blitting the trimmed PNG at
`(ox − cellW/2, oy − bodyBottom) × scale`. No per-frame canvas processing
happens at runtime, which also means the game no longer cares about
canvas-tainting — though it should still be served over HTTP like any module
app.

## Regenerating

The extractor reads the v1 sheets, so it only matters if you want to re-run
history — the extracted PNGs in `sprites/assets/` are committed and
self-sufficient:

```sh
cd tools
python3 extract_sprites.py --src /path/to/v1/assets
```

Debug contact sheets (grid, tight bounds, detected foot lines) are written to
`tools/debug/<char>_contact.jpg`.

## Facing, sizing, and cleanup passes

Three more correction layers ship in the manifest, all curated frame-by-frame
against comparison boards (see `tools/debug/`):

- **`faceLeft`** — the sheets are drawn facing **RIGHT** by default; this was
  verified against every character's run row (all 17 run rightward, see
  `tools/debug/run_facing.png`). A minority of cells — mostly aiming/casting
  poses whose weapon or blast points the other way — are drawn facing left and
  carry `faceLeft: true`. The engine mirrors those so a fighter always looks in
  their logical direction.

  > **Polarity warning.** An earlier version of this table was inverted: it
  > listed the same frames as *right*-facing exceptions against a *left*-facing
  > default, which made **every character face backwards** in game (running
  > right while looking left). If characters ever look reversed again, check
  > this table's polarity before touching the renderer. The quick test: force
  > `f.facing = 1` on both fighters and confirm they look rightward.
- **`renderScale`** — dramatic technique cells and some imagegen crouch cells
  are drawn at a different zoom (Hakari's jackpot cell is ~30% oversized,
  Momo's crouch-attack ~35% undersized). 23 frames carry corrections so a
  fighter keeps one body size across animations.
- **Pixel repairs** — flat-white matte wedges (Sukuna r0c0/r1c2/r1c3), baked-in
  transparency checkerboards (Toji r2c1, Inumaki r3c1), and sub-60px pinholes
  in every frame (moth-eaten hair) are removed/inpainted at extraction time.

## Repaired source-sheet quirks

- **Momo's crouch row** now uses auburn-haired Kyoto-uniform replacement art.
- **Hanami's crouch row** now consistently uses the bark-bodied cursed-spirit
  design.
- **Toji's hurt frame** (`r2c3`) was replaced to remove doubled linework.
- **Sukuna's crouch row** now matches the Yuji-vessel uniform used elsewhere.
  `r4c2` needed one re-delivery: the first attempt came back semi-transparent
  (49% opaque) because the chroma key ate his pink hair and skin.
- **Mahito's left arm** unravels into hanging threads in several frames — it's
  drawn that way in every generation of the source art (and is, honestly, very
  Mahito).

Remaining quirks are content issues in the painted sheets, not extraction
bugs — fixing them means repainting those cells.

## A renamed file makes a fighter invisible

The manifest is the **index**: it names the file each pose draws from, and those
names move. Hanami's canon redraw renamed all 36 of his — `hanami/incoming/idle_a-2.png`
became `hanami/idle_a.png` — and a browser holding the previous manifest asked
for 36 files that no longer existed, got 36 404s, and drew a fighter with no art
at all. Invisible, silently, and only him: everyone else's paths had not moved.

Two things follow, and both are now in the code:

- **The manifest is fetched `cache: "no-cache"`** (`loadCoreAssets`,
  `src/assets.js`) — revalidated on every load, so the index can never be older
  than what it indexes. The images themselves still cache normally; they are
  addressed by a name that only changes when the drawing does.
- **A pose that cannot be drawn says so.** `drawCharFrame` returns `false`
  instead of returning quietly, warns once per pose, and the renderer paints an
  **ART MISSING** box at the fighter's hurtbox. A fighter who is not on screen
  points at everything except the art that failed to arrive, which is why this
  took a bug report to find.

Renaming a delivered file is still fine — that is what `tools/apply_sprite_adjustments.py`
and the intake tools do — but it is worth knowing that the old path dies with
the rename, and anybody mid-session is one reload away from it.

## A flag belongs to the pose, a drawing belongs to itself

Flag `attack_light_a` and you are asking for **`attack_light_a`** to be drawn.
That sounds too obvious to write down until you notice that the pose may not be
drawing its own file: a pose with no art of its own is pointed at a neighbour's
so the game draws something (the 18G fault), and the workbench can borrow a
drawing deliberately — a prone body made out of a standing one. So `attack_light_a`
can be showing `attack_heavy_a.png`, and a request raised on it has three
possible subjects: the pose, the file, or the pose that file belongs to. Only
the first is ever what was meant.

The manifest gets this right — `needsReplacement` is written on the pose,
`intake_import.py` lands the answer on the pose (`incoming/<pose>.png`), and
`canonicalise_sprites.py` knows one file can serve several poses and leaves the
name with the pose that owns it. What went wrong twice was in what a **person
reads**:

- `tools/intake_sheets.py` printed `now: attack_light_a` under a pane showing
  `attack_heavy_a.png`. The board is where a delivery is judged, and the
  judgement changes completely: against a predecessor the question is "is this
  better", against a stand-in it is "is this the pose at all". It now names the
  drawing it is actually showing and marks it `<- stand-in`.
- `docs/image-requests.md` gave such a pose two rows — a flagged one showing
  another pose's drawing with nothing to say so, and a stand-in row thirty
  lines away that said so but carried no note. One row now, and the flagged row
  says whose drawing it is showing.

**The file decides, `borrowedFrom` only names.** The workbench records where a
borrowed drawing came from, which reads better than a filename — but it is
written when a pose is pointed AT another pose's art and was not cleared when
it was pointed back, so nineteen poses claimed a source while drawing their own
file. It is banked with the drawing's other fields now (`VARIANT_ORIGIN` in
`sprites/src/sprites.js`), so switching away clears it; and every reader asks
the file first and uses `borrowedFrom` only to name the pose the drawing
belongs to. A delivery suffix comes off before that comparison —
`incoming/idle_a-2.png` is `idle_a`'s own second delivery, not somebody else's
drawing.

## Other Sprites: what the workbench can actually change

`effect:*`, `summon:*` and `stagefx:*` art belongs to no fighter, so it has no
manifest entry and no placement — the code that spawns each one decides how big
it is and where it goes. **That knowledge is now written down**, in the registry
at the bottom of [src/shared_sprites.js](../../src/shared_sprites.js): for every
shared drawing, the height the game paints it at and the point on the picture
that lands on its spawn point. It is derived from the kits, the summon pools and
the draw sites rather than restated, so it cannot drift from them.

The workbench reads that registry to decide which controls to show, and the game
reads the same file to apply them:

| Control | What it does | Shown when |
|---|---|---|
| **Mirror** | the drawing points the wrong way | always |
| **Size** | multiplies the height the game paints it at | something declares a height |
| **Spawn point** (on the canvas) | drag it; the drawing moves under it, storing `dx`/`dy` in game pixels | the drawing is painted somewhere |
| **Rotation** | a standing tilt about the same point | the drawing is painted somewhere |
| **Attack box** (on the canvas) | drag it to place what the creature hits WITH, corner to size it | the drawing is a creature (a measured hurt box, standing on its feet) |

**The size has four owners**, which is why it used to look broken: a kit's
`spriteH` (or `orbSpriteH`, or a drop entry's `h`), a creature's `h` in
`config_summons.js`, the install aura's constant in `render.js`, a hazard's in
`stage_fx.js`. Only the first was read, so a number typed against a summon was
stored, displayed, and inert.

**It looked broken a second way even after that was fixed**, and this one was
the viewer's fault: the canvas drew every shared sprite at its *delivered* pixel
height and then clamped it to fit. Nearly every plate is taller than the viewer,
so nearly every one sat pinned at the clamp and the slider changed nothing you
could see. The viewer now draws at the height the game uses, times the zoom —
which is also what makes a creature comparable to the fighter standing beside it.

**A creature has two boxes, and only one of them is placed here.** What it can
be *hit on* is the whole drawing — measured at 85% of the drawn rectangle, so it
follows the art and there is nothing to set. What it hits *with* is a different
shape and always was: a dog bites with its head, and a tail that deals 6.5% is a
bug you can only find by playing. That one is a rectangle you drag onto the
drawing, stored as four fractions of it (`attackBox` in `otherSprites`, read by
`sharedAttack`), so it travels with the art — rescale the creature or redraw it
bigger and the bite stays on the mouth. Unplaced, it defaults to the leading 44%
of the creature's length, which is the right end of every quadruped in the
pools; a bomber's is its whole body, because the thing that touches you is
whichever part got there first.

**The spawn point replaced two sliders.** Position used to be a horizontal and a
vertical nudge, which asks you to hold in your head which way positive runs and
what the number is measured from. It is one crosshair on the canvas now, drawn
where the game paints the drawing, captioned with what the game expects of it —
*painted around the point*, *standing on it*, *hung from it* — and dragging it
moves the drawing beneath. The numbers are still `dx`/`dy` underneath and still
export the same way.

**None of it moves what the drawing collides with.** A projectile's centre, a
creature's footing, a hazard's reach: all unchanged. That is the point — art
arrives off-centre in its plate and the fix is to move the picture onto the point
the game is using, not to move the point.

**Most spawn sites do not read the nudge at all**, and the crosshair says so
rather than pretending. Two draw sites place a drawing on something that moves
and read `sharedAdjust` as they go — `drawProjectiles` in `render.js` and the
creature draw in `summons.js` — and every other handler paints its set piece
straight from `getImage`: the traps, the drops, `spawnSummonFlash`, and the
dozen ultimate directors. A `dx`/`dy` or a tilt set against one of those is
stored and inert. Size still works, because that is folded into the kit's own
declared height before the handler sees it — except where the RENDERER fixes a
height too (Yuta's Rika at 238px, Panda's triceratops at 210px, a domain
backdrop cover-fitted to the stage), and those are marked unsizable so the
slider comes off rather than sitting there looking live.

`DRAW_SITES` in `src/shared_sprites.js` is that table, one entry per special or
ultimate `type`, each read off its handler: where the point is, whether the
nudge reaches it, whether it travels. Two answers about a spawn site living in
one place is the point — a tornado that stands on the floor (`tempest`:
`translate(640, 595)` then `-h`) was centred in mid-air for the same reason a
geyser was, and both are one line here.

### Standing it where the move puts it

A shared drawing used to be shown alone in the middle of the canvas with a
fighter beside it for scale. It is now shown **where the move puts it**: the
fighter stands in the pose that throws it — the special's own slot animation, or
`ult` — at exactly the distance the handler spawns it at, so a beam can be lined
up against the hand that fires it rather than against a guess.

Those distances are read off the handlers and live in `LAUNCH` beside the rest
of each spawn site's answers: `spawnProjectile` at `ox ?? 70` forward and
`oy ?? -86` up, `spawnSummonFlash` at the fighter's feet and its own `forward`,
a trap at `dist ?? 220`. The drawing keeps the middle of the canvas and the
FIGHTER moves to the right distance, so switching drawings does not send the
thing you are looking at wandering around the viewer.

The offset itself is the MOVE's, not the drawing's — it is a kit number, the
same one for every drawing that move might use — so the workbench shows it and
does not edit it. What the workbench edits is where the picture sits relative to
that point.

**A melee move's box is drawn on the fighter too.** Several moves whose art is a
flash beside a swing — Yuji's divergent fist, Panda's drum, Mahito's soul touch,
Rika's claw — declare that swing's `w`/`h` on the same kit node as the drawing,
where they read like the drawing's own box. They are nothing of the kind:
`spawnMelee` puts them on the FIGHTER at its own offset while the art stands
somewhere else. Drawing that rectangle around the picture claimed a shape the
game never tests there; it is drawn from the fighter now, labelled as the
swing's.

### Directional effects, and the one point they have

A projectile is drawn centred on its own position, and that position IS the
circle it collides on: `drawProjectiles` hangs the picture around `p.x`/`p.y`
and tests a radius at the same point. There is no second point to move. A nudge
moves the PICTURE off the point; nothing can move the collision off the art,
because in the game there is only the one coordinate.

**It is also mirrored to the way it is travelling** (`flip = vx > 0 ? -1 : 1`),
which is why `docs/asset-requests.md` asks for travelling art drawn pointing
LEFT: the stored plate is the leftward version, and a player firing right sees
its mirror. The workbench therefore shows travelling art **as fired**, mirrored,
with an arrow — because showing the plate while the game shows the flip is how a
drawing already pointing the right way gets "corrected" with the Mirror box into
flying backwards. The nudge is applied inside that same mirrored frame, in the
game and here, so `dx` means the same thing in both.

### The region of interest, and what follows what

With **Hurtbox** ticked, a shared drawing is shown with the region its move
actually acts on: a projectile's `r` as a circle, a creature's `hitW`/`hitH` or
a drop's `w`/`h` as a box. All of them are numbers the kit already declares —
nothing is invented here and nothing changes play. A move that declares a
`width` rather than an `r` is one of the two big shots, and both of those spawn
an ordinary projectile at `r: width / 2` (`ultimates.js`), so that is what is
drawn: a circle of that radius, not a band across the screen. And the shape
belongs to the drawing it describes rather than to the node it was found on —
Mechamaru's ultimate names the cannon and its five orbs together, and the orbs
collide on their own `orbR`.

They are drawn because they are the one thing the art has to agree with and
cannot be measured from the art: a bolt drawn twice the width of its `r` looks
like it should clip somebody it passes straight through.

**They are marked `fixed`, and that word is the point.** A shared drawing's hit
region does not follow Size and does not follow the spawn point — it is a kit
number, so moving the size slider moves the picture against a stationary target
and you can see the moment they agree. A fighter's hurtbox is the opposite case
and is labelled the other way, *follows the art*: it is measured off the sprite
(`src/silhouette.js`), so resizing the pose resizes the box with it.

One shape is labelled `follows Size` instead, and it is not an inconsistency:
`randomDrop` paints a drop at the same `h` it collides on, so there the box and
the art are one number and no amount of sizing will make them disagree.

**One zoom for the whole scene, and no fit where the size means something.**
The art, the hit shape, the spawn point, the drag, and the fighter standing
beside it as a size reference all read the same zoom. That reference is the
entire basis for sizing an effect — the question is "how big is this next to
the man who throws it" — so a viewer that scales the two by different numbers
is worse than no viewer: a too-tall drawing used to be fitted to the canvas
while the fighter stayed at the slider's value, showing the effect at three
quarters its real size next to him.

So a drawing whose height the kit declares is drawn at the Zoom slider's value
and nothing else, and runs off the top of the viewer if it is that big — which
a vending machine twice a fighter's height genuinely is. Zoom is the control
for that, and the canvas says so. The fit survives only for art nobody declares
a size for, standing in with its own plate, where there is no ratio to preserve
in the first place; there the reference shrinks with it and the panel says the
size is relative.

**The reference is the fighter whose move spawns it**, taken from the registry
rather than from the first kit that mentions the art. Megumi's shikigami pool
lists Panda's triceratops as a stand-in before Panda's ultimate declares it, so
reading mention order stood the wrong man beside it — and on a size reference
that is the whole judgement, not a caption detail. Creature drawings are the
exception the other way: their registry owner is the creature itself, so those
fall through to the kit that carries the pool.

That distinction decides which way round to work. Against a fixed box you size
the art to fit the box; against a box measured from the art you size the art to
look right and the box follows.

**Ambience is not the working set.** A domain backdrop is cover-fitted to the
whole stage and an install aura is a glow around a fighter — the game draws
both, neither is placed against anything, and listing them padded every to-do
view with drawings there is no placement work to do on. They appear under **All
sprites** only, and keep their controls there: an aura's size and nudge do reach
the screen.

**A drawing that nothing spawns gets no controls**, and the panel says why. That
same answer drives the **Used in game** filter for Other Sprites.
`node tools/check_shared_sprites.mjs` walks the real kits and fails if a move
names its art under a field the registry does not know — which is how Yuta's
Rika (`sprite` beside a plain `h`) and Mechamaru's pigeon orbs were found.

### What a FIGHTER's pose is placed against

The same question, on the other side of the workbench: a pose is drawn against
the shapes the game tests while it is on screen, so the art can be matched to
the play rather than to a guess.

**Attacks.** Every move in `moves.js` is asked which animation it plays
(`m.anim`) and grouped off that answer, rather than a table here naming the
animations itself. The table drifted, which is exactly what a derived list
cannot do: both dash attacks and the up tilt were missing from it, so
`attack_dash` — a pose whose whole job is reach — was shown with nothing to
place it against. Only the STRIKE frame of a pair gets a target; a wind-up's job
is to not have connected yet.

**Grabs.** A grab tests a plain rectangle and ignores shields (`src/grab.js`),
so it has no hitbox to mark and its three poses used to be placed against
nothing at all. Each is now shown with its own geometry, read from that file's
arithmetic at the workbench's live measurements:

- `grab_reach` — the box the closing hand tests, `reach × 0.85 + GRAB.grace`
  forward and 90% of body height tall, with the far edge marked. The open hand
  should be somewhere near that edge.
- `grab_hold` and `grabbed` — the other fighter's body, `(a.width + b.width) ×
  0.45` ahead, where `pinVictim` puts it. From either pose the partner stands
  the same distance forward, because the victim is turned to face the holder:
  the hands in one and the body in the other have the same place to be.

**Neither grab guide asks you to move the drawing.** The red box is where the
game pins the other fighter and its caption says where that distance came from;
the blue line is where the two fighters' hands meet. The body stays on its own
ground contact either way — what lines up with the blue line is the HAND, and
the way to move it is to place the `grabHand` anchor on the fist, not to slide
the sprite sideways off the spot the game pins it to.

**The blue line is the hand, not halfway between the bodies.** It was drawn at
`gap / 2` on the reasoning that the midpoint is where the two hands meet, which
only holds if the holder's hand and the victim's chest sit the same distance out
from their own centres. They do not: `grabChest` is near the victim's own centre
line on every fighter, between -10 and +4, so the midpoint came out at about
half the reach — **9 to 27px inside the fist it was naming**, 22px on Sukuna.
Read as a target that says "move him left", which is the one thing the guide
must never say.

**No fighter had a `grabHand` on `grab_hold`, because there was no handle to
drag.** `src/grab.js` reads the hold's own hand first and falls back to the
reach's — and the fallback was all there ever was, on all 34, because
`EXTRA_ANCHORS.grabHand` listed only `grabReach` among its states. A slot the
code reads and the tool cannot fill is a slot that stays empty. It lists both
now, so the handle appears on the hold and placing it is ordinary work on the
pose in front of you.

There is no verification queue for it, and there should not be: `grabHand` and
`grabChest` HAD review queues in that bench once, and they were taken out for
the reason the preamble of `workbench/verify_body_points.js` gives — the bench
that shows the drawing is the one that should ask where a point on it belongs,
and two doors into one value is a place for them to disagree about which door
the game came through.

**The grab guides ride with the Anchors toggle**, because that is what they are
about. Every other reference on that canvas says where to put the DRAWING; these
three say the opposite in so many words — "place the anchor rather than slide
the drawing until it touches a line", "NEITHER POSE MOVES TO IT". Drawn
unconditionally they read as two more targets pulling at the sprite, which is
exactly how the hold's pair got read.

## Preparing delivered effect art

`tools/prep_effects.py` runs over `assets/sprites/effects/` and
`assets/sprites/summons/` after every delivery. Generated art arrives with
25-46% transparent padding, which matters because the renderer sizes a sprite
by its image height — padding makes an effect draw undersized and shifts it off
the projectile's collision center or off the ground line. The tool trims to the
alpha bounding box, drops keying specks, and downscales. It is idempotent.

## Delivered-art hygiene

Generated replacement art is checked on arrival for two failure modes that a
magenta chroma key introduces: **semi-transparent subjects** (body pixels below
full alpha, so the stage bleeds through) and **warm-tone loss** (pink hair and
skin sit near magenta and get keyed away). Sukuna's `r4c2` hit both. Prefer
true alpha output, or a neutral grey key, for characters with pink or red
palettes.

## Sizing: why `bodyH` is not a size control

Every delivered pose is generated to fill its canvas, so the raw art bbox is
near-identical across poses (measured 986-991 px for all 14 of Gojo's new
frames). `renderScale` is derived as `bodyH / artBBoxHeight`, which means the
**rendered size is driven entirely by the hand-set `bodyH` target** — and
because bbox height is not pose-invariant, matching bbox heights across poses
does *not* make the character look the same size.

This bit us: `ledge_hang` shipped with `bodyH` at ~53% of idle and rendered as a
tiny figure in all 17 characters. A hanging pose extends the silhouette
vertically, so its target must *exceed* the standing idle, not fall below it.
Corrected to `idle_a x 1.15`.

**Nothing here can be fixed by measuring the art.** Head-size measurement — the
obvious pose-invariant proxy — is unreliable on this art: on Toji's run frames
the detector measures a "head" 478-606 px wide because it captures arms and
torso. Two separate attempts at automatic size normalisation produced worse
results than hand values, and a third would too.

What *can* be automated is the opposite approach: never look at pixels, and
compare one hand-set number against the others. Ten animation states turn out to
carry a single height ratio across every size-reviewed fighter, and those are
recoverable exactly — `tools/audit_frame_sizes.py` reports them and
`tools/auto_tune.py` sets them on import. The other fifteen states vary 8-18%
between characters, which is the size of the corrections themselves, so they are
refused rather than guessed at. See
[sprite-auto-adjust.md](sprite-auto-adjust.md).

**So sizing is still a human-in-the-loop judgement** everywhere it is actually a
judgement. `tools/size_review.py` renders every pose at true in-game scale on a
shared ground line with the idle head height marked, and `workbench/` (see
below) allows live adjustment.

### How big a character is overall

Per-*pose* size is `bodyH`, above. How big the *character* is comes from their
canon height — see [character-heights.md](../../docs/character-heights.md). Briefly:
`heightCm` in characters.js becomes a head-height target, and `heights.js`
solves each character's draw scale from it. The sprite workbench's **Character
height** control edits that one number and rescales the whole sprite set.

### Replacing a sprite whose art is wrong

Placement problems are fixed in the workbench. Art problems are not — the file
itself has to change. Two flags carry that, and **the line between them is who
does the work:**

- **Sprite needs replacement** (`needsReplacement`) — the drawing is wrong and
  nothing in the file can be edited into the right picture. It goes out as an
  asset request and comes back as new art.
- **Improvement request** (`wantsImprovement`) — the drawing is right and the
  *file* is wrong. That is repo work, done here with `tools/dekey_fringe.py` and
  friends, and it never waits on a round.

Each has a dropdown naming *what* is wrong, because a redraw and a re-key are
very different asks and a request that does not distinguish them is one someone
has to come back and clarify:

| Flag | Kind | Means |
|---|---|---|
| `needsReplacement` | `quality` | the drawing is rough, malformed or off-model |
| `needsReplacement` | `pose` | reads poorly, or is not the action it stands for |
| `needsReplacement` | `character` | likeness or costume is off |
| `needsReplacement` | `alternate` | the drawing is not condemned — deliver a **second** one beside it. See below. |
| `needsReplacement` | `delete` | this DRAWING is surplus — discard it and keep the other variant. Only offered on a pose that has more than one drawing, so a deletion can never leave a pose with no art. Stored on the variant option rather than the pose, because it names one image out of several. |
| `wantsImprovement` | `alpha` | transparency is wrong or has hard edges |
| `wantsImprovement` | `crop` | the framing or bounds are wrong |
| `wantsImprovement` | `bleed` | colour bleeds past the silhouette |

It used to be the other way round — `replace` sat beside `fix alpha` under
`needsReplacement`, and pose and quality complaints were filed as the softer
wish, so the blocking list was full of things nobody needed to draw. [19efd99]
split them by who does the work. Anything written before that uses the old
names; a legacy `true` or `"replace"` still reads as `quality`.

Either flag can carry a **description** — free text saying what is actually
wrong with this drawing, written in the workbench beside the dropdown. The kind
says which of six shapes the fault has; it cannot say that the naginata bends
where it crosses her chest, and the person who spotted that is otherwise the
only one who ever knew. It is optional, it travels through the same export and
apply path, and `list_replacements.py` prints it under the pose and as a column
in the markdown a request is written from. Notes belong to the *drawing*
(`VARIANT_REVIEW`), so switching drawings does not leave a description of the
old one attached to its replacement, and clearing a flag clears its note.

#### Request alternate

`alternate` is the one replacement kind that does not condemn the drawing. The
ask is still "draw this" and it goes out in the request like the others, but the
delivery lands **beside** the current art rather than on top of it: a second
option on the pose's chevron, with the selection untouched. It is for a pose
that works and might work better, where replacing it outright throws away
something you cannot get back if the new one loses.

It is the one delivery that leaves no trace of itself — the art on screen is
unchanged, the numbers are unchanged, and the only new thing is an option behind
a chevron nobody has a reason to open. So `intake_variants.py` marks the new
option `fresh`, which the workbench draws as a dot on the chevron and on the
option itself, and puts the pose on the **All Recently Updated Poses** list with
`how: "alternate"`. Both clear when the pose is adjusted or marked reviewed, the
same lifecycle as every other marker here.

#### A repeated flag is a missing rule

A flag is one sentence about one drawing, but flags come in batches, and the
same complaint on four fighters is not four mistakes — it is something nobody
told the artist. That belongs in [pose-brief.md](pose-brief.md), the standing
brief a new set is drawn from, which is cumulative where the request files are
not. `python3 tools/list_replacements.py --markdown` groups the open flags by
kind, which is the quickest way to see a repeat.

#### A flagged pose is marked in the grid

A `needsReplacement` flag other than `delete` means **somebody has been asked to
draw this pose again**, so the cell carries a red **⚠** in its corner and the
cell itself is dimmed. Both say the same thing: any placement done on this
drawing today is measured off art that is on its way out, because the
replacement is measured from scratch when it lands.

Neither is a barrier — the pose still selects, still edits and still exports,
because a request can sit unanswered for rounds and the art has to stay usable
in the meantime. The point is only that you find out *before* starting rather
than after. `delete` is excluded: it throws a drawing away and asks for nothing,
so no art is coming. The improvement flags are excluded too — they are repo work
on the file we already have, and nothing arrives to overwrite the numbers.

**A flag is also an instruction to the next import.** When new art arrives for a
flagged pose, what happens to the old drawing is decided by what the flag said —
`intake_variants.py --plan` reads it and reports the disposition:

| Flag on the pose | Incoming art |
|---|---|
| `needsReplacement`: `quality`, `pose`, `character`, or the selected drawing tagged `delete` | **replaces it outright** — the old art was condemned, so nothing is kept |
| `needsReplacement`: `alternate` | **added as a variant, selection unchanged, and marked new** — the request asked for a second opinion, and selecting it here would answer the question it was raised to ask |
| any `wantsImprovement` | **added as a variant and selected**, old drawing kept as a fallback |
| unflagged | **added as a variant, selection unchanged** |

The split is between a verdict on the *drawing* and a complaint about the
*file*. "Redraw this" says the drawing should not survive; "the alpha is wrong"
says it should, and a delivery answering one is a second opinion rather than a
replacement — kept beside the original until something is demonstrably better.
See [assets/intake/README.md](../../assets/intake/README.md).

**Answering these flags is a procedure, not a judgement call each time.** Ask for
a "full sprite cleanup" and [sprites/docs/sprite-cleanup.md](sprite-cleanup.md) is what
runs: deletions applied, alpha/crop/bleed fixed in place with a before/after
contact sheet and workbench deep links to approve, and everything needing new art
folded into the open asset-request round.

The kind is the flag's *value*, so there is one field rather than a boolean and a
reason that could disagree. `REPLACEMENT_KINDS` and `IMPROVEMENT_KINDS` in
`sprites/src/sprites.js` are the single source of truth — `list_replacements.py` parses
both from there — so adding a kind is one line.

The flag rides through the same export and apply path as everything else:

```
workbench  ->  Export  ->  apply_sprite_adjustments.py  ->  needsReplacement: true
python3 tools/list_replacements.py --markdown     # grouped by kind, for a request
```

#### What survives the redraw

A wholesale redraw and a crop fix are not the same event, so they do not get the
same treatment on the way back in. `KIND_PLACEMENT` in `sprites/src/sprites.js` maps
each kind to how much of the existing placement is still meaningful, and
`intake_import.py` follows it:

| Kind | Survives | Because |
|---|---|---|
| `alpha` | **keep** | same drawing, same bounds — every measurement and anchor is still exactly right |
| `crop`, `bleed` | **reframe** | same drawing, moved bounds — the tuning still applies, but the numbers have to be re-pointed at the new framing |
| `quality`, `pose`, `character` | **discard** | a different drawing; nothing about the old placement means anything |
| `delete` | **none** | there is no incoming art, so there is no placement to decide |

An unflagged frame is treated as a wholesale replacement, which is the safe
reading: nothing said the art was merely being touched up.

The reframe is the delicate one, and it is delicate in two ways. Anchors are
stored in the image's own pixels, so they move when the framing does. And a
frame's `oy` and `bodyBottom` are *independent* — `bodyBottom` is the foot line,
`oy` is where the art sits, and the gap between them is a hand-tuned ground
contact for a pose drawn in perspective. Re-deriving either from the other
silently throws that away.

So a touch-up's placement is derived from **how far the re-crop moved the
drawing**, not rebuilt from scratch: `ox`/`oy` shift by the change in the content
box, the anchors ride along with them, and `renderScale` is held so the drawing
comes back at exactly the size it had. Matching rendered *heights* instead would
be wrong — trimming a bleed makes the content box smaller, and stretching the
result back would quietly enlarge the fighter.

`tools/test_intake_placement.py` proves it, against synthetic re-crops of real
art where the right answer is known: the art stands in the same place, the tuned
ground contact survives, and the anchor keeps both its height above the feet and
its offset across the body.

#### Clearing

The flags clear themselves. `intake_import.py` drops `needsReplacement` and
`wantsImprovement` when the new art lands; on a `discard` it drops the anchors
and measurements too, and rolls back hand tuning first, because a nudge made to
compensate for bad art must not be inherited by the art that fixes it.
`apply_sprite_adjustments.py` records each hand-edited field's pre-edit value in
`edited` so that rollback has something to restore.

Flagging and importing are the two ends of one pipeline, so the list is always
what is still outstanding rather than a historical record.

#### Finding what the round overwrote

Rolling the tuning back is right, and it leaves work to do: those poses now stand
at whatever the placement maths derived for the new art, and someone has to go
back through them. They are scattered across the roster by definition — a round
touches four fighters — and one character at a time is the wrong shape for
finding them, which meant opening every character and remembering which poses
had been tuned before the delivery.

So an import over existing art leaves a marker on the pose:

```json
"replaced": { "at": "2026-08-08T18:22:04+00:00", "kept": "discard",
              "how": "import", "lost": ["ox", "renderScale", "anchors"] }
```

`lost` is what has to be redone — the keys of the `edited` map that was rolled
back, plus the anchors when those went with the drawing. An empty `lost` is a
touch-up that came back with its tuning intact: worth a look, not a re-tune. A
brand-new pose is marked too, as `how: "new"` with an empty `lost`, so it sorts
below the poses with tuning to redo — it overwrote nothing, but it still has to
be placed, and a round that adds fifteen poses to one fighter and seventeen to
another scatters that work exactly the way an overwrite does.
`intake_variants.py` writes one too when it
selects a delivered alternate over the art a pose was pointing at, because the
pose's numbers stop applying just the same.

#### What the action player is FOR, and what it promises

"Play it in action" exists so a shared drawing can be placed against the thing
the game does with it, and the only thing that makes it worth anything is
fidelity: the height, the anchor, the mirroring, the layer order and the nudge
have to be the ones the real spawn site uses. An audit of it in one sitting
turned up five ways it was lying, and each is worth knowing about because each
is the shape the next one will take:

- **The size was applied twice.** `applySharedSpriteScales` folds a drawing's
  `renderScale` into the height its kit declares (`spriteH` 260 becomes 104 at
  0.4×) and keeps the authored number as `spriteHBase`. Every spawn site reads
  the folded height and never touches the scale again — and the player read the
  folded height and multiplied by the scale a second time, so anything anybody
  had resized was previewed at scale² of its plate. It now unfolds to the
  authored height and applies the scale once, which is both correct and live.
- **The drawing under review was not the one the dials moved.** A creature's
  own projectile is previewed by playing the creature that fires it; dragging
  the marker moved the CREATURE, because the playback applied the live
  adjustment to whatever it drew first. The body now draws from its own stored
  numbers and the live ones follow the drawing that is actually on the bench.
- **A wave was previewed in mid-air.** `combat.js` overrides a wave's y to
  `groundY - r * 0.7` and `render.js` paints it `r * 0.68` lower still, because
  a wave rides the floor. The player put it at the muzzle its `oy` names.
- **Everything was painted over the fighter**, where the game paints every
  shared drawing behind them.
- **One anchor described neither of its uses.** `stagefx:stage_fang` is drawn
  from the platform line UP, so it grows out of the floor; the registry called
  it centre-anchored and the bench swelled it about its middle.

The same pass found the mismatch in the other direction — a control the bench
offered that the game ignored, and one the game honoured that the bench hid.
Four spawn sites (the warp strike, the cloud field, `spawnSummonFlash` and the
trap) plus the four stage hazards were storing a rotation and never drawing
one, so they read it now; and a domain backdrop, which the bench said could not
be moved at all, has always been panned by `dx`/`dy` in `drawDomainBackdrop` —
a real choice about which part of an over-wide plate shows, and the only one
those nine drawings have.

`node tools/check_effect_previews.mjs` guards the first question (is there a
preview, and does it paint anything). The rest of this is arithmetic that no
check can see: when a new spawn shape is added, the honest test is to open the
handler and the player side by side.

#### Why these keep happening, and the shape of the fix

Every fault in the list above is the same fault. **What a move type does with
its drawing is written down three times**, in three places that cannot see each
other:

| Where | What it holds | Who reads it |
|---|---|---|
| the handler in `src/specials.js` / `src/ultimates.js` | the truth: where it is painted, at what height, mirrored or not | the game |
| `DRAW_SITES` + `LAUNCH` in `src/shared_sprites.js` | anchor, mirroring, spawn point | the still viewer, the panel, the crosshair |
| `DIRECTORS`, `FLASH_MOVES`, `PLANTED_MOVES`, `ULT_SHOTS`, `ULT_DROPS`, `WORN`, `HAZARDS` in `sprites/workbench/effect_preview.js` | the same facts again, as playback | the action player |

**This has been fixed since.** The table above is what the code used to look
like; what follows is the record of why, because the same shape will grow back
if nobody remembers what it cost.

A new move type has to be entered in the second and third by hand, and nothing
notices when it is not. `massDrive` was in the registry and not the player, so
Miwa's ultimate had no Play button. `boomerang` was in the player and not the
registry, so the same staff pointed one way in the viewer and the other in the
player, the fighter beside it stood in his idle instead of the pose that throws
it, and there was no crosshair. Three directors said they were not mirrored
while their handlers mirrored them. A creature declared inline in a move put its
stand-in's answer in the registry over the use that really draws.

**The check that exists now** (`tools/check_effect_previews.mjs`) closes the
gap from the outside: it plays every drawing and asserts the two views agree
about the anchor and the mirroring, which is exactly the pair a missing table
entry gets wrong. It found four more the day it was written.

#### What replaced it

Four things, in the order they were done. Each one turns a class of bug from
*detectable* into *impossible*, and each carries a check so it stays that way.

**One spawn-shape table** — `src/config_spawn_shapes.js`. One entry per move
type: anchor, mirroring, whether it travels, its launch point, its height
source, which playback the action player uses, and the handler's file beside
it. The registry and the player both read it; neither holds its own copy.
`tools/check_spawn_shapes.mjs` asserts that every kit type naming a drawing has
an entry, that every entry names a playback the player implements, that every
playback belongs to an entry, and that every `site` path exists. Its first run
found a missing `ultDrop`, a dead `cardrop` and a `site` pointing at nothing.

**One owner for a drawing's height** — `paintedHeight(key, base)` in
`src/shared_sprites.js`. The workbench's Size used to be folded into every
kit's `spriteH` at boot, un-folded by the registry, and applied a third time at
the draw by anything whose height was not a kit number. Three conventions, and
the only way to know which one a line was written under was to know the
history: the action player did not, so every drawing anybody had resized was
previewed at scale-squared while the game drew it right. There is one multiply
now, and `tools/check_shared_heights.mjs` fails any line outside that function
that reaches for a scale itself.

**One transform** — `paintShared` in `src/shared_paint.js`, with
`sharedPlacement` for a painter that cannot use a canvas (the 2.5D scene builds
the chain out of matrices) and `sharedRect` for a caller that wants the
rectangle without the picture. Thirty-one draw sites each rebuilt the same five
lines by hand — translate, mirror, tilt, draw with the nudge and the anchor —
and each got a different part of it wrong at some point. The conversion itself
turned up two more of the same fault: Hanami's root spikes ignored the
workbench's Size, and the summon preview applied the nudge before the tilt
where the game applies it after.

**A layered bench** — `workbench.js` was 6,321 lines and 233 functions in one
module, which is the reason a fix in one panel could quietly change another:
everything could see everything, so nothing had to declare what it needed. It
is six modules now — `bench_state` (canvas, geometry, the mutable state),
`bench_model` (what a sprite *is*), `bench_picker`, `bench_shared_art`,
`bench_export`, and the page itself — importing downward only, with
`tools/check_bench_layers.mjs` holding the direction. The two leaves that need
something back from the page are handed it at boot (`initSpritePicker`,
`initSharedArt`) rather than importing it.

`tools/check_effect_previews.mjs` stays: it plays every drawing and asserts the
two views agree about the anchor and the mirroring. It was written as the cheap
half of this work and it is still the outside check on all of it.

#### Shared art is on the same list, for a different reason

An effect or a summon has no intake marker to carry: a delivery overwrites those
bytes in place, by hand, and nothing stamps the pose. What puts one on the list
is the same question asked directly — **the game draws this and nobody has ever
set a number against it**. A machine-placed number does not count; `autoTuned`
is a starting point offered up to be disagreed with, which is why those entries
read *placed by a machine — never agreed with* rather than being treated as
done.

Two rules keep that honest, and both were learned by getting them wrong:

- **A drawing with nothing to decide is not undecided.** A domain backdrop is
  cover-fitted to the whole stage, so it has no size, no offset and no tilt.
  All nine sat on the list permanently — the only way off is a number, and
  there is no number to set. They are excluded. A backdrop that is *wrong* has
  the redraw flag, which is the other list.
- **"I looked at it and it needed nothing" has to be sayable.** Marking a
  drawing reviewed writes `surfacedReviewed` onto its `otherSprites` entry, the
  same marker a pose leaves by, creating the entry if the drawing never had one
  — having no entry is precisely what put it on the list. Before that the
  button was hidden for the whole shared set, a gate written before shared art
  could be on a list at all, and the only way off was to nudge a drawing that
  did not need nudging.

### Staged fighters are edited here too

The dropdown lists every fighter in `CHARACTER_KEYS` **plus every one in
`STAGED_CHARACTER_KEYS`** — the ones whose art is unfinished and who are
therefore off the select screen. That is not a special case bolted on; it is the
set the tool exists for. A staged fighter's sprites arrive through the same
intake, land on the same updated list and wait for the same approval, so
hiding them meant a delivery could not be looked at until the fighter was
already live, which is backwards.

They are labelled *(not on the roster yet)* rather than hidden, because it
changes what an approval means: nothing is drawing either drawing today, so the
decision settles which one the set carries when the fighter ships. The
**Replacement waiting** panel says so on a staged fighter.

#### And promoting one owes every roster-wide round it missed

A fighter staged for two rounds is a fighter deliberately left out of every
roster-wide request made in the meantime. Kashimo, Yaga, Naoya, Kirara, Haruta,
Tengen and Miwa reached the select screen short seven poses each — the teeter
(22A), both walk contacts (21), the dash attack (20D) and the three grab poses
(20C) — and nothing went red, because every one of those states falls back to
art the fighter does have. The gap that gets noticed is the one somebody
happens to look at.

`node tools/check_pose_coverage.mjs` is the answer, and it runs in
`npm run check`. It compares every fighter's animation states against the
manifest and fails on a pose that is undrawn AND unasked-for — the same rule the
request docs keep for workbench flags, that a gap with no request is work nobody
can see. It does not fail on missing art as such: an art round IS missing art.
Write the request and it goes green.

Two kinds of entry are exempt, both deliberately: `fallback` frames, which are
by definition somebody else's pose, and the four throw keys, which 20C
registered without requesting because the heavy attack swung that way already
reads as a throw. That exemption lives in the check with the reason attached,
because a silent exemption is how the teeter happened.

The sprite workbench's character dropdown ends with **All Recently Updated
Poses**, which is those markers listed across the whole roster, newest round
first and the poses that lost tuning at the top. It is not a character: selecting
a pose switches to its character underneath, so the panel, the export and the
undo stack go on working on real characters — one pass can walk poses belonging
to four fighters and export all four at once, which the export already handled.

It drains the same way the flags do. Adjusting a pose takes it off the list, since
being retuned is the entire point of being on it; **Mark reviewed** is for the
other outcome — the new art needed nothing — and exports as `clearUpdated`, which
`apply_sprite_adjustments.py` reads. Neither takes effect until the export is
applied, so a pose stays on the list, ticked or dotted, while it is worked on.

**Approving is not one of the two exits.** A held delivery sits on the list as
*replacement waiting*; approving it moves it to **approved into the game —
placement not agreed with** and leaves it there, because the size and ground
contact it went in wearing were measured off the new matte rather than chosen by
anyone. The two exits above are still the only exits: tune it, or say it needed
nothing.

**An alpha fix is a different job, and the list says so.** A re-key lands the
*same drawing* on top of itself — the file is rewritten in place, the placement
carried whole — so there is no alternate on the chevron and no old drawing left
in the repo to stand beside it. The comparison slot is legitimately empty, which
looked exactly like a delivery that had gone missing when 237 of them arrived at
once, and every one of them silently asked "did the position move too?".

`kept: "keep"` is what answers it. `survives()` in `tools/intake_import.py` reads
the flag the pose was carrying, and `alpha` is the only kind `KIND_PLACEMENT`
carries the placement through — a redraw discards it, `crop` and `bleed` reframe
it. So the marker already knew; nothing on screen was reading it. Now four places
do, off one predicate (`isAlphaFix`):

| Where | What it says |
|---|---|
| The count line | `237 alpha fixes (placement unchanged)`, counted apart from the poses that need re-tuning |
| The cell | `alpha only, not moved` — the grid tells the two jobs apart without a click |
| The panel headline | `alpha fix — nothing moved`, readable without opening the section |
| The empty comparison slot | *alpha fix — same drawing, re-keyed in place; nothing to compare* |

The reviewer's question is then the only one a re-key can answer: are the EDGES
clean — fringe, hard cut-outs, holes through the body. Nothing about size,
ground contact, centring or anchors is in question, because none of it changed.

Directly beneath it is its mirror image, **All Needing Regeneration**: every pose
carrying a `needsReplacement` flag, across the whole roster, grouped by kind. The
updated list is what *arrived*; this one is what was *sent back*, and it is the
list an art round is written from. Before it existed the only way to read that
was to open all twenty-eight characters and count the flagged cells, which is how
a flag set in one session got forgotten by the next.

**A pose you flagged and then pointed at a drawing that works is not on it.**
Marking the delivered art bad and choosing a good alternate is a fix, not a
request — asking again would commission a drawing that is already in the repo.
Nothing enforces that rule directly: `needsReplacement` reads the *pose*, and a
pose mirrors whichever drawing it currently points at (`poseView`), so a
reassigned pose simply stops being flagged. The rejected drawing keeps its own
tag, which is what the variants menu and `delete` want. `tools/smoke_workbench.mjs`
asserts both halves, because on screen a listed pose and an unlisted one look
exactly alike.

### All Unresolved Poses — the list the dots are made of

The dot beside a name in the character dropdown means *this set has work left*,
and `charTodo` counts four things: a replacement waiting to be approved, a pose
flagged for a redraw, a pose waiting on a file fix, and a pose the game draws
that nobody has placed. The two lists above are each one of those, so neither
could be worked down to "no dots left" — and the dot itself used to read
committed state only, so it survived every approval and every placement until an
export had been applied and the page reloaded, which is exactly when it mattered.

**All Unresolved Poses** is the third list, and it is the same predicate read the
other way round: `poseTodo(char, frame)` says why one pose is outstanding, the
dot counts it per character, and the list collects it across the roster. Clear
the list and every dot is gone, by construction rather than by maintenance —
`tools/smoke_workbench.mjs` asserts the two directions of that (a dot with
nothing listed, an entry with no dot) since neither is visible on screen.

**The dot moves; the list remembers.** The dot reads live — flag a pose and it
comes back with the flag, approve the last replacement on a character and it goes
as the button is clicked — and session work counts as settled for it: a pose
placed but not yet exported, or marked reviewed.

The list does not shrink to match. A pose joins it when something is outstanding
and *stays* once answered, greyed and ticked, exactly as a reviewed entry stays
on the updated list: approving a replacement or placing a pose is the moment you
most want to keep looking at it, and an entry that vanished on the click took the
thing you were about to adjust with it. So membership is what the codebase said
at load, plus anything that has become outstanding since — never less, until a
reload. The count on the dropdown entry is the *open* half, which is why it falls
as the pass is worked and hits zero with the last dot while the grid holds still.

The pose grid's own view filters are a third thing again and still read the
committed answer (`hasSavedEdits`), so the working views do not reshuffle under
an edit.

The shared set is deliberately not on it. It carries no dot — an effect plate has
no placement work of the kind the dot means — and listing drawings that nothing
could ever clear would break the list's one promise. Rejected effect plates are
on **All Needing Regeneration**, which does cover the shared set.

### Improvement requests

`wantsImprovement` is the softer ask: the art *works*, it is just not as good as
it should be. One of `quality` (rough or sloppily executed), `pose` (reads
poorly, or is not the action it stands for) or `character` (likeness or costume
is off) — `IMPROVEMENT_KINDS` in `sprites/src/sprites.js`.

It travels the same export/apply path and is listed by the same tool, but
separately and after the replacements, because nothing is blocked by one.

### Catching poses that are sized wrong

`tools/audit_frame_sizes.py` compares every pose against the height its
animation state occupies across the size-reviewed roster — a crouch is short, a
ledge hang is tall — and reports the ones that fall outside it. It never
measures the art, which is what made the two earlier normalisation attempts
worse than hand values; it only compares one hand-set number against others.

```
python3 tools/audit_frame_sizes.py          # report
python3 tools/audit_frame_sizes.py --fix    # correct the outliers
```

Run it after importing a new character. Rounds 7-9 shipped without a size pass
and it found 41 broken poses across those six fighters and none across the
original 17 — including the same `ledge_hang` bug documented above, and `run`
frames rendering at 0.65-0.72x instead of the 0.82x every reviewed character
uses.

## Intake pipeline (round 6 onward)

Delivered art lands in `assets/intake/<char>/<frame>.png` and is **not** loaded
by the game. Three steps, each separable so a bad delivery stops at the door:

1. `tools/intake.py` — keys the background, straightens facing, measures body
   height / clipping / green fringe / holes, writes `assets/intake/_processed/`.
2. `tools/intake_sheets.py` — before/after boards labelled with the animation
   state each frame drives, for human approval.
3. `tools/intake_import.py --approve FILE` — copies approved frames into
   `sprites/assets/` and registers them.
4. `tools/bake_anchors.py` — measures the rotation pivot (and the two placed
   points: the ledge grip on a hang pose, the front foot on a teeter) for
   anything newly registered. Skips frames whose anchors were
   placed by hand, so it is safe to re-run over the whole roster.
5. `tools/auto_tune.py` — applies the placement corrections that are mechanical.
   See [the tuning phase](#the-tuning-phase) below.
6. `tools/canonicalise_sprites.py` — after the round's approve/keep verdicts are
   applied, gives each pose's drawing the pose's own name and archives the one
   it displaced. Deliveries land in `<char>/incoming/` and approving them is a
   change of pointer, so this is what keeps the tree describing the game rather
   than the order things arrived in. Re-runnable; a no-op when everything is
   already where it belongs.
7. **Move the answered requests into history.**
   [asset-requests.md](../../docs/asset-requests.md) is defined as "everything in here is
   outstanding", so a delivered section has to leave it or the file misreports
   what is still needed. See step 9 in
   [assets/intake/README.md](../../assets/intake/README.md#what-happens-to-it).

Placement is delegated to `extract_sprites.generated_frame_meta`. A replacement
inherits the old frame's rendered height and foot line, so a swap changes art
and never size; a brand-new frame borrows the character's idle scale factor.

Step 4 exists because the sprites rotate now — see `sprites/docs/sprite-motion.md`. A
frame with no `anchors.com` still draws, falling back to a heuristic; it just
pivots less convincingly than a measured one.

### The tuning phase

Steps 1-4 land the art. What they cannot do is decide where it stands, and for
years that was entirely a hand pass in the workbench.

Some of it turned out not to be a judgement at all. `edited` stores each
hand-tuned field's *pre-edit* value, which makes every correction ever made a
labelled example — the pipeline's answer beside a human's. Asked across 1,605 of
them, three of the corrections are mechanical and the rest are not;
[sprite-auto-adjust.md](sprite-auto-adjust.md) is that measurement and
`tools/auto_tune.py` is the part of it that runs.

```bash
python3 tools/auto_tune.py --report     # what the rules learned from the roster
python3 tools/auto_tune.py --backtest   # scored against the hand values
python3 tools/auto_tune.py --dry-run    # what it would do to the last import
python3 tools/auto_tune.py
```

The bar for a rule is not "usually right" but **wrong in a consistent
direction**, because a correction that guesses can land further from the answer
than doing nothing and does it silently. Three clear it: the ground contact
(the derived foot line is the bottom of the alpha box, which it can only ever
be — all 513 hand corrections raised it), the horizontal centring (the derived
`ox` centres the bounding box, so a naginata drags the body off centre), and
the size of the ten animation states every reviewed fighter sizes identically.
Rotation and facing do not, and are left alone.

**Tuning is not an edit.** The workbench's *No saved edits (to do)* list, its
character markers and the recently-updated list all read `meta.edited`, and
nothing here writes there — provenance goes to `autoTuned`, which the panel
shows as "Auto-placed · not an edit". A tuned pose is still a pose nobody has
looked at, because a rule measured across the roster cannot say whether *this*
drawing looks right. The tuner also never touches a field that appears in
`edited`: a value somebody chose while looking at the sprite outranks every
measurement in it.

`tools/test_auto_tune.py` holds those guarantees down — that a hand-edited field
survives, that nothing is marked as edited, that a non-uniform state is refused,
and that running it twice changes nothing the second time.

**The foot rule declines where there is no foot.** `NO_STANDING_FOOT` names the
states whose contact is not the sole of a standing foot: `prone`, which lies
flat, and the five airborne states, which touch nothing at all. In the air the
rule was solving for a contact that does not exist — it pinned every jump, fall,
air dodge and aerial by whatever pixel hung lowest, a trailing toe or a tucked
heel, to the ground line. What an airborne pose has to sit correctly inside is
the **hurtbox**, which does not move when a fighter leaves the ground, and only
an eye can place a tucked body in it. So the rule leaves them alone and the
workbench's vertical-position control is live there.

`tools/audit_air_placement.mjs` is where that gets checked. It measures every
pose against the box `combat.js` actually tests for it and reports the ones
sitting lower in their own hurtbox than the same pose does across the rest of
the roster — per pose key, because a `dodge_roll` is legitimately floor-level
and a flat threshold would report the whole column.

### Keying, and why it is layered

Three passes, each narrower than the last, because a single rule cannot tell
background from art:

- **border flood fill** — key colour reachable from the canvas edge
- **strict pass** — unmistakable key colour anywhere, for background sealed
  inside the silhouette
- **flat-fill pass** — key colour that is also locally uniform; art over the
  same colour carries lineart and shading, background does not

Translucent motion trails drawn over the key come back tinted and defeat all
three. Those are cleared per-frame via `TINT_FIX` / `GREY_TINT_FIX`, named by a
reviewer, never swept.

**Facing is not automated.** `detect_facing` returned near-zero confidence on
two thirds of round 6. Only confident calls are acted on; the rest are marked on
the board and corrected via `FACING_OVERRIDE`.

## Clothing FX reads a character's art by colour, so intake must re-verify it

Settings -> **Clothing FX** (off by default) keys a character's garments out of
their own drawing at runtime, so the stage shows through them — Uro's cloud
outfit, the way the anime sometimes draws her. There is no second sprite set and
no bake: `src/clothing_fx.js` runs a pass over each frame's pixels the first time
it is drawn with the setting on, and hands the renderer a canvas of the same
size. The manifest, the anchors, the silhouette measurements and every hitbox
are untouched — the effect cannot move a body, only make part of it absent.

**Which makes her art load-bearing for something the art pipeline does not know
about.** The key finds the cloth by hue: a saturated cyan band that nothing else
on her — orange skin, violet hair, brown leather — occupies. Re-export her with
a slightly bluer cloud, redraw a pose in a different outfit, hand her a cyan
accessory, and the key takes something else. It took her forearm off at the
wrist during the build, because her cursed-energy palm FX is drawn in the same
cyan as her clothes.

So **a delivery that touches Uro is not landed until the key has been looked at
again.** Two things make that a step rather than a hope:

1. `sprites/assets/clothing_fx.json` records, per frame, the hash of the drawing
   and what the key took out of it — share of the body box, how far down the
   body the opening reaches, how much of the cloth's own outline survives.
2. `tools/check_clothing_fx.mjs` runs the real key over the shipped art and
   compares. It is in `npm run check`, needs neither browser nor server, and
   distinguishes the two failures that look identical from outside:

   - **THE ART MOVED** — the drawing's hash changed. The key may be fine or may
     now be eating an arm; nobody can tell without looking.
   - **THE KEY MOVED** — same drawing, different result, so somebody edited the
     profile in `clothing_fx.js`.

The fix for either is the same and it is not editing the numbers:

    node tools/uro_seethrough_test.mjs --contact    # every pose, keyed, over a stage
    node tools/check_clothing_fx.mjs --bless        # once it looks right

Blessing rewrites `clothing_fx.json`, which lands in the commit as a diff — the
numbers in the repo are the numbers a person looked at.

**Not every pose can be keyed, and that is a judgement about the drawing.** Her
set is not drawn in one outfit: most poses are the two cloud bands, a few
(`crouch_b`, `grab_hold`) are a one-piece that keys to a bigger opening and still
reads as her, and `prone` is a full-length gown — keying that leaves a head, one
arm and a wisp of hem. `prone` is therefore in the profile's `skip` list. The
check hashes skipped frames too, so a redraw of one comes back for review rather
than staying skipped forever on the strength of a drawing that no longer exists.

**Adding a second character is a colour question first.** A profile is only
sound when the garment occupies a hue band nothing else on that character's body
uses. On a fighter in a jacket, over art with no body drawn underneath, the same
pass makes a hole rather than a window. Check that before copying Uro's numbers,
and look at the contact sheet before blessing anything.

## Alternate sprite sets *(removed)*

`manifest.alternates.<char>.<frame>` used to hold a whole second art set for a
character, opted into with **Settings → Sprites: Default / Alternate**; unlisted
frames fell through to the default set, so an alternate only shipped the frames
that differed. Hanami's round-6 tree design was the first and the only one.

It is gone. Round 17A redrew him to canon, that set was approved, and one
toggle serving one retired design is not a feature worth carrying — so the
manifest key, the loader path and the Settings button all came out together.
The eight frames are kept at
[`assets/reference/hanami_alt/`](../../assets/reference/hanami_alt/) as a
record of art that shipped for a while, and nothing else: the design is
retired for good, and the last six references to it — dead variant options on
four sheet-era poses, pointing at files that moved out of the sprite tree with
the feature — came out of the manifest with it. They were the one thing
`tools/canonicalise_sprites.py` refused on, so the names could not be put back
on the drawings while they were there.

Not to be confused with a pose's **variants**, which are alive and are a
different thing: several drawings of ONE pose, chosen between in the workbench
(`manifest.variants`). Those are how a replacement is stood beside what it
replaces. An alternate set was a second look for a whole character.

## Summoned-curse sprites

`tools/extract_curses.py` lifts Geto's four cursed spirits and his rainbow
dragon out of the art they were drawn into, writing them to
`assets/sprites/effects/`. Baking a creature into a fighter frame means it
cannot move, be timed or be reused, and it inflates the fighter's bounding box.
As projectiles they do all three. His volley uses `spritePool`, drawing a random
curse per shot.

## How the art gets loaded (lazy, in `src/assets.js`)

Sprite art is ~450 MB across 23 fighters and a match uses at most four of them,
so nothing waits on the whole roster. The loader splits three ways:

| Function | What it fetches | When |
|---|---|---|
| `loadCoreAssets()` | `manifest.json` only (~230 KB) | before the menu, blocking |
| `startBackgroundLoad()` | shared art, then each fighter, then stage backdrops | behind the menu |
| `ensureMatchAssets(keys, stage)` | whatever this match still lacks | at match start |
| `loadFrame(char, frame)` | one frame | the workbenches, selected pose first |
| `loadAllAssets()` | everything, awaited | nothing in-tree; kept for one-off scripts |

The menu itself needs no canvas art: select-screen portraits (`assets/cards/`)
and stage tiles are plain `<img>` tags the browser fetches on its own. So the
blocking load is one JSON file, and the title screen appears in well under a
second.

Behind it, a **pump** walks a queue one group at a time. A group is one
fighter's frames (plus their alternate set), one stage backdrop, or the
`shared` bundle — effects, summons, domain backdrops, stage-hazard props. One
group at a time is deliberate: a fighter is ~30 files, which already saturates
the six connections a browser opens per host, so running several at once would
only mean the fighter a player just picked queues behind three they did not.

Two levels of priority sit on top:

- **Looking at a fighter** (pad cursor, mouse hover) calls `previewCharacter()`,
  which moves them to the head of the queue. It starts no download of its own,
  so sweeping across the roster cannot kick off twenty parallel loads.
- **Choosing a fighter** calls `claimCharacter()`, which starts them
  immediately, outside the queue, and makes the pump defer until every claim has
  finished. The CPU's random draw and the default fighters on slots 3 and 4 are
  claimed the same way.

The two workbenches use the same core load and then stream **only the character
on screen** (`workbench/lazy_sprites.js`): the selected pose first so there is
something to look at, then the rest of that set behind it, with a spinner on the
canvas until the pose has art. Switching characters abandons the previous tail —
its frames stay cached, so switching back is instant, but no bandwidth finishes a
set nobody is looking at. Gojo's idle is fetched separately because it is the
size benchmark drawn beside *every* character, and the action workbench pulls the
individual effect and summon art a move spawns via `loadSharedImage()`. Both
mirror the current character (and pose, or action) into the URL with
`replaceState`, so a reload or a shared link comes back to what you were editing.

`ensureMatchAssets()` is the backstop, and it waits on the entrants and the
stage backdrop **only**. Everything in `shared` has a procedural fallback in the
renderer — a summon or effect that has not arrived yet draws its stand-in shape
— whereas `drawCharFrame` bails on a missing image, so a fighter without frames
would be invisible. That is the whole reason the gate exists. In practice it
never shows itself: a fighter claimed at pick time is in memory long before the
player has chosen a stage. It does show for a Random slot, which only resolves
to a concrete fighter inside `resetMatch()` — and re-resolves on every rematch.

## Staging changes for upload

There is no VCS here, so `tools/collect_updates.py` tracks what still needs
uploading in `tools/.updates-ledger.json` — a map of every file ever staged to
the mtime it had when staged. The ledger lives beside the tool, NOT inside
`updates/`, because `updates/` is emptied after each upload.

    python3 tools/collect_updates.py --new     # what changed since last staged
    python3 tools/collect_updates.py --new --list

`--hours N` and `--since` still exist for one-off queries, but `--new` is the
one to use. A time window cannot tell "changed recently" from "changed a while
ago and never uploaded", and the second case is the one that loses work.
