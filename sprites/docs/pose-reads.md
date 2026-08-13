# Pose reads — what each sprite frame says the body is doing

A **pose read** is eighteen joints written down for one drawing: head, neck,
chest, pelvis, and a shoulder/elbow/hand and hip/knee/foot/toe for each side.
One file per character in [`pose-reads/`](pose-reads/), keyed by frame name.

It exists because the 3D fighters need to know what their own art does, and
because *describing* a pose does not work. A description can be vague and
still sound right; a stick figure with the elbow in the wrong place is visibly
wrong. So a read is coordinates, it is drawn back over the drawing it came
from, and the overlay is the test.

```
sprites/docs/pose-reads/<char>.json     the reads
render3d/workbench/?edit=pose           the editor — drag joints, watch the rig
tools/pose_seed.py                      seeds a character from the read reference
tools/pose_apply.py                     puts an editor export back in the tree
tools/pose_contact_sheet.py <char>      the sheet, and --check
tools/pose_rig_sheet.mjs <char>         every pose's RIG beside its drawing
tools/pose_three_up.mjs <char>          drawing · matched · baseline · generated · in-game
tools/pose_silhouettes.mjs              do the baseline poses read apart?
tools/pose_verify.py <char>             crossed limbs, lopsided pairs, impossible turns
tools/check_pose_reads.mjs              runs in `npm run check`
```

Those check different things and none of them replaces another.
`--check` measures every joint to the nearest ink, so it proves the read sits
on the art. `pose_verify.py` asks whether the *body* those joints describe is
possible — legs that cross at the shins, a thigh twice its partner, a shoulder
line wider than the shoulders go — which is what a swapped side actually looks
like in arithmetic. `pose_rig_sheet.mjs` drives the real editor in a real
browser and puts each posed rig next to the drawing it came from, which is the
only one of them that catches an interpreter bug rather than a read bug, and it
is how the feet below were caught. `pose_three_up.mjs` goes one further and
puts the two proposed poses beside the one the game plays today, which is the
only view that can say whether either is an improvement. And
`window.__poseAngles()` in the editor gives the rig-versus-drawing comparison
as a number per bone, in degrees, while `window.__handsAt()` says where the
hands ended up.

## The three things a read has to get right

**Orientation.** A read describes the frame as the **engine draws it**, not as
the PNG is stored. Frames the sprite manifest marks `faceLeft` (or lists under
`nativeLeft`) were delivered facing left and are mirrored at blit time; every
tool here mirrors them first. Yuji's `hurt` is one of them, and reading the raw
file recorded him snapping his head back in the direction he was facing.

**Sides.** Joints are the **character's own** left and right, never the
screen's. Facing right, the camera sits off the fighter's right shoulder, so
the RIGHT limb is the near one and the LEFT limb is the far one drawn behind
the body. Sided names survive a mirror; "near" and "far" do not, and a rig
posed from near/far data throws a left-handed punch on half the roster.

Which drawn limb is the near one is a **judgement, and the obvious answer is
usually wrong**. The reflex is to give the near side to the arm the eye lands
on — the one extended into the punch. In this art it is the other way round:
the extended arm is drawn passing BEHIND the collar, and the arm crossing the
chest, fully visible over the jacket, is the near one. Eight of Yuji's frames
were read the wrong way round on exactly that reflex. Judge it by occlusion,
never by prominence: **the near limb is the one drawn over the torso; the far
limb is the one the torso interrupts.** When a whole pose comes out backwards,
the editor's **⇄ Swap L/R** exchanges every sided joint in one click, and
`python3 tools/pose_migrate.py swap <char> <pose>...` does the same on disk.

**The cell.** Coordinates are percentages of the frame's own square cell — the
frame scaled so its long side fills a square, centred, x rightwards, y
downwards, 0–100 both ways. Frames differ wildly in aspect (a prone drawing is
939×208, an idle 423×1497); the cell is what makes one read comparable with
another, and what the editor and the contact sheet both lay out in.

## The editor

`node server.mjs`, then
[`/render3d/workbench/?edit=pose`](../../render3d/workbench/).

The bar carries the **build time** of the editor itself. If it is older than a
change you are looking for, the checkout is behind — `git pull`, then reload;
the dev server sends `no-store` for source and the read is fetched with a
cache-buster, so nothing here is ever served stale from a cache.

Pick a character, pick a frame from the grid, drag the joints onto the drawing.
Dragging a joint carries everything below it in the chain (shift-drag moves the
one joint); arrow keys nudge; **Snap to art** pulls stray joints onto the
nearest ink; ⌘Z undoes. Beside the plate the character's **own 3D rig** takes
the pose, each bone swung in the drawing's plane to match — which is where a
read that looked fine flat turns out to bend a knee backwards.

The rig pane has two dials of its own. **View 3D** (bottom right) turns both
panes off the drawing's angle together. Bottom left is a **mode cycle** —
click it to walk the four poses every frame has:

| | |
|---|---|
| **Matched** | this frame's own pose, matched by looking at the drawing ([`battle_poses.js`](../../render3d/src/battle_poses.js)) |
| **Baseline match** | the generic pose for what this frame **is**, from its name and the brief ([`baseline_poses.js`](../../render3d/src/baseline_poses.js)) |
| **Generated** | the pose worked out from the eighteen joints you can drag |
| **In Game** | the clip the game plays for this frame **today** |

It is a cycle rather than a checkbox because there are four answers, and the
last is the one that decides anything: the first three are proposals, and none
is worth shipping unless it beats what a player already sees.
`tools/pose_three_up.mjs` lays all five out for a whole sheet at once.

**The plate carries two skeletons.** The black one is the read — the eighteen
joints the handles drag. Over it, in the mode's own colour, is what the rig
*actually ended up doing*, read back off the posed bones and fitted onto the
drawing. Without it, cycling the mode changed the model and left the stick
figure alone, and there was no way to see what a matched or baseline pose was
doing to the body except by eye on the render.

It is **fitted**, not anchored — one uniform scale and one offset, chosen to
minimise the squared distance over every joint the two skeletons share.
Anchoring at the pelvis and scaling by the torso was the obvious thing and it
piles every proportion difference onto the extremities: the rig's `Head` bone
sits at the base of the skull where the read's `head` is its centre, so the
overlay's head landed nine cells low and its feet seven cells through the floor
even when the pose was right. A fit leaves only the thing worth looking at.

In **Generated** the two skeletons are meant to agree, and the gap between them
is the interpreter's compromise — an arm the IK could not reach, a knee it had
to fold. In the other three the gap is the whole point.

### The baseline is the floor, and it has no holes

Matched is per-drawing and only exists where somebody has looked at a drawing —
which is Yuji, and nobody else. **Baseline** is per-*intent*: what a frame
called `crouch_a` should look like, from its name, the
[pose brief](pose-brief.md) that commissioned it, and the same human-movement
library. Every frame name on every sheet resolves to one, so it never falls
back — `tools/check_battle_poses.mjs` walks all 1389 frames across the roster
and fails if any lands nowhere, or if an intent is defined that nothing reaches.

#### Do the poses read apart?

A fighting game is read at speed and at size, and what a player reads first is
the **outline** — before the colours, before the details, long before the
hands. Two moves with one silhouette are two moves the player cannot tell
apart. That is a property of the *library* rather than of any pose in it, so no
amount of looking at one pose catches it, and it gets worse exactly as the
library grows.

`tools/pose_silhouettes.mjs` measures it: every intent is posed on a real rig,
its outline is read off the canvas, and all 528 pairs are compared by
intersection over union. It fails above 0.86, and the handful of pairs allowed
to be close have to say what tells them apart in play — a `poise` and a
`stance` are the same body, and the aura is the difference.

**Anticipation is held to a tighter limit (0.72)**, against the pose it winds
up out of. A wind-up is the only frames an opponent gets to react in, so it has
to read differently from what the fighter was doing a moment earlier — not
merely differently from everything. That rule found two real defects on its
first run: `strike_wind` sat at **0.73** against the stance and `crouch_wind`
at **0.79** against the crouch, which is a heavy attack telegraphing nothing.
Both were re-coiled — chest further away, hips dropped and loaded onto the rear
leg, lead shoulder pulled back — and are now 0.61 and 0.48.

It needs a browser and a running server, so it is a hand-run tool rather than
part of `npm run check`; run it whenever the library gains a pose.

Two other things make the baseline more than a default. The first is the **beat**: the brief is
explicit that in an attack pair `_a` is the wind-up and `_b` is the strike, so
the suffix selects a *different intent*, not a variation on one. Getting that
wrong gives a fighter two contact frames and no anticipation, which is the
single thing that makes a strike read slow. The second is that the baseline
follows the **brief** where Yuji's sheet departs from it — a generic `crouch`
is a deep squat, `ledge_hang` grips with both arms, `land` posts one hand,
`dizzy` slumps forward, `jump_rise` is still stretching upward. Put Matched and
Baseline side by side on `crouch_a` and the gap between them *is* the value a
read adds, which is worth being able to see.

**In Game** samples the fighter's real clip: `poseEntry` says which state draws
this frame and at what time (the two tables come from the same fps, so frame
*i* lands at *i/fps*), and `resolveClip` resolves the same clip the engine
would — the character's own, an inherited one, or the default, mirrored if the
manifest mirrors it. Rotation only: applying the root's position track would
slide the model out of frame while the other two keep their hips at the bind,
and holding all three to one rule is what makes them comparable.

### The two badges answer different questions

They sit on the same screen and are easy to read as one, so both name what they
are talking about:

| | |
|---|---|
| `joints: …` beside the frame name | where the **eighteen dots on the plate** came from — `read by eye`, `fitted from yuji/idle_a`, `hand-placed on disk`, `edited here` |
| the badge over the rig | which pose the model is **actually in**, and whether that is the one you asked for |

So `joints: read by eye` next to `3D: matched human pose` is not a
contradiction and does not mean the frame lacks a match. It means a human
placed those dots *and* the frame has a matched pose — the normal case for
every frame of Yuji's sheet.

The mode you asked for is not always the one you get, so the badge carries two
facts rather than one — what is on screen, and whether it is a fallback. A
fallback says so in a warning colour and names its reason: *no per-frame match
for this frame* (its picker tile also carries no dot), or *nothing in the game
draws this frame*, which is true of `attack_heavy` among others, because the
states draw `attack_heavy_a` and `_b` instead. Fallbacks land on the **baseline**
rather than on the generated pose, because the baseline is the floor. **Baseline
match itself never falls back** — that is the contract it exists to keep.

Edits last as long as the tab and no longer: press **Download this character**
(or **All edited**, for a session that touched several) before you leave, and
a reload is how you say "start again from what is on disk". They used to be
kept in localStorage, which sounded like a kindness and was not — a held edit
silently outranked the file, so a correction already applied to the tree came
back as the old pose, and a pose held from before toes existed drew a handle
for a joint that was not in it. Send the file on and `python3
tools/pose_apply.py <file>` puts it back in the tree in canonical format,
checking joint completeness, frame names and ranges on the way in.

### Depth, and the view that authors it

A joint is `[x, y]`, or `[x, y, depth]` once somebody says otherwise. Depth
points at the camera, in the same cell percent, and it is absent by default —
a drawing is one view, and it does not say how far a fist travels toward the
lens.

### Foreshortening is depth, but only when there is a lot of it

A limb drawn short *can* be a limb pointing at the camera, and the missing
length says how far. Inferring that is worth doing and easy to overdo, and the
overdone version is much worse than not doing it at all — this sheet is nearly
all flat, side-on drawings, and a fighter wrongly swung toward the lens is a
worse read than a flat one. Four rules keep it honest, and each of them exists
because leaving it out broke the sheet:

  * **Measure against a typical limb, not the longest one.** The body's scale
    in a cell is the *median* of what its limbs imply. Taking the maximum — as
    the facing calculation must, or it saturates — means measuring seven limbs
    against the single most generously drawn one and calling all seven
    foreshortened. That alone put a limb more than 15 cells deep on 39 of
    Yuji's 40 frames, one of them **170 cells deep in a 100-cell frame**.
  * **Compare a limb to its own opposite number.** Yuji's shins are drawn at
    0.89 of what the rig says a shin is worth, on all forty frames — that is
    how the artist draws a leg ending in a trainer, not forty drawings of a
    shin angled at the lens. Two shins both at 0.89 are two normal shins.
    One at 0.45 beside a partner at 1.0 is a leg coming at the camera.
    Asymmetry is the signal; shortness alone is not, and this self-calibrates
    to whatever body a character is drawn with.
  * **Make it clear a threshold first.** `sqrt(want² − flat²)` is savage near
    the top of its range: a limb at 90% of length comes out 44% of a limb deep.
    Nothing under three quarters counts, and only the part beyond that.
  * **An authored limb is nobody else's business.** If any joint down an arm or
    a leg carries an explicit depth, the whole limb is left alone. A hand set
    by hand at 7.6 with an inferred elbow at −13 wedged in behind it is not the
    arm anybody drew.

The result on Yuji: thirteen frames carry no inferred depth at all, the median
frame's most-affected limb moves 6.5 cells, and the worst moves 17.

Some poses need it anyway. An arm angled inward across the chest reads flat as
a short arm, and dragging in two dimensions cannot fix a pose whose problem is
the third. **View 3D**, bottom right of the rig pane, turns both panes off the
drawing's angle together — drag either one, scroll to move in, and the joint
overlay on the sprite turns by exactly the angle the rig does. A joint dragged
while the view is turned moves in the plane you are looking at, so the drag
lands as x, y *and* depth. Switch it off and both return to the drawing's
angle. The angle is shown next to the pose name and clicking it goes back.

As the view turns away, the sprite behind the joints fades — from there it is
a picture of a different viewpoint, and reading it as the thing to match is
how a pose gets dragged onto the wrong silhouette. It never disappears.

The free-look dial itself is [`render3d/workbench/orbit.js`](../../render3d/workbench/orbit.js),
shared with the clip bench's own **View 3D** so the same gesture means the same
thing in every pane of that page.

Two limits worth knowing while you work:

  * **The hips do not move.** The preview swings bones; it does not translate
    the root or plant the feet, so a deep lunge reads shallower in 3D than in
    the art, and the widest stances on the sheet — `ult_a`, `ult_b` — come out
    narrower than they are drawn.
  * **Anything the eighteen joints cannot say** — a wrist roll, a head turn
    out of plane, a spine twist — belongs to the keyframe bench at
    `?edit=animation`, which poses any bone on any axis.

### The shoulder line and the hip line say which way the body is TURNED

They sit on rigid bars, so how far apart a drawing puts them is not decoration
— it is an angle, and it is the one piece of depth a flat read has always
carried without anyone reading it:

| The drawing | The body |
|---|---|
| shoulders as far apart as this sheet usually draws them | side on, facing right |
| shoulders wider than usual | angled toward the lens |
| shoulders narrower than usual | angled away — we are seeing some of his back |

**"As usual" is doing real work in that table, and it is measured.** The naive
zero — shoulders one on top of the other — is not how anybody draws a side
view. An artist drawing a fighter side-on still shows both shoulders: Yuji's
sit 0.286 torsos apart in the median frame, and 38 of his 40 frames are on the
same side of zero. Read literally that says the entire sheet is turned a
quarter of the way toward the camera, which is not what a single one of those
drawings shows. It is the house style, applied evenly.

So the zero is **the sheet's own median**, and what turns a fighter is how far
a frame departs from how that fighter is usually drawn. It calibrates per
character, which matters — the roster is not drawn to one shoulder convention,
and a baseline borrowed from Yuji would turn Panda. And it is capped at 35°:
this is side-on art, a marker line is a few hand-placed dots, and past a
three-quarter view those dots are being asked for more than they know.

On Yuji the result is 33 of 40 frames within 10° of facing right, which is what
the sheet looks like; the ones that move are the ones drawn turned —
`dodge_air` and `dodge_roll` tumbling away from us at −35°, `prone` at −24°.

Facing right with his chest open to us, a fighter's LEFT shoulder is the far
one and lands on the screen RIGHT: the same flip you see looking at someone
across a table. The editor prints both angles beside the pose name, so widening
the markers turns the fighter and the number follows.

From that angle everything else follows. The shoulders and hips get their
depth; the pelvis turn goes on the hips so both legs — and the feet on the end
of them — come round with it, which is how a foot ends up pointing at the
camera; and the chest turn goes on the spine as the DIFFERENCE, because a body
counter-rotates and the shoulders are allowed to face somewhere the hips do
not. Widths come from the fighter's own rig as a fraction of their torso, since
a read is in cell percent and a cell is a different size in every frame.

**How far** the bar is turned comes from that width and nothing else. Authored
depth on the shoulder or hip markers gets a vote on *which way* and no vote on
how far, which is not the obvious rule: given depths on both ends, the angle of
the bar falls straight out of `atan2`, and that reading is correct in geometry
and disastrous in practice. It treats two authored numbers as measurements of
one rigid bar, and nobody authors them that way. `attack_air_a` carried 0.1 on
one shoulder and nothing on the other and came out at **+89°**, dead square to
the camera off a tenth of a cell; `attack_air_b` carried a deliberate 0.6 and
0.2 on the hips and came out at **+92°**. A bar six cells across in a drawing
is six cells across whatever hangs off its ends, and a fraction of a cell
between them is not the twenty-five cells of depth a genuinely square-on
shoulder line would carry. What the depths do settle — when they are at least a
tenth of the bar's width, so they clearly mean it — is which end is nearer.

It is also a **check on the sides**. A drawing that shows the chest and a read
whose left marker is on the left cannot both be right — the arms are the wrong
way round. That test flagged 24 of Yuji's frames in one pass, which is the same
mix-up occlusion catches, caught by arithmetic instead of by eye.

### What each joint drives in the preview

| Joint | Bone |
|---|---|
| pelvis → chest, chest → neck | `Spine`, `Spine2` |
| shoulder line → head | `Neck` |
| chest → shoulder | `LeftShoulder` / `RightShoulder` — the clavicle, so a shoulder can be **raised** into a punch |
| shoulder → elbow → hand | `LeftArm` / `LeftForeArm` and the right pair |
| hip → knee → foot | `LeftUpLeg` / `LeftLeg` and the right pair |
| foot → toe | `LeftFoot` / `RightFoot` — the toe joint is how a foot is **pointed** for a kick |
| shoulder line | the spine's TWIST — how far the chest is turned toward the camera |
| hip line | the pelvis's twist, and both legs and feet come with it |

### How far a limb reaches, and in what order the bones are aimed

Arms and legs are **solved**, not aimed: the drawing says where the fist and
the foot are, and the chain folds until they land there. Aiming alone was why
every low pose stood up — a rig leg is one length, so a knee aimed down and a
foot aimed down put the foot a whole leg away and the fighter back on his feet
whatever the drawing said. The read's elbow and knee are used as the direction
the joint **bends**, never as a position: a drawing's limb lengths are whatever
the artist drew.

Its **distance** is not used either, and that is the one that took two goes to
get right. Turning cell percent into rig metres needs a scale, every way of
picking one is a guess, and the guess fails hardest in the poses that matter —
this art draws a punching arm longer than the model's arm, so any honest scale
folds a straight punch up at the chest. What a drawing says *without* a scale
is how **straight** the limb is: shoulder-to-fist over the arm's own drawn
length. That fraction belongs to the pose rather than to anyone's proportions,
it survives foreshortening once depth is in, and the rig extends by the same
fraction of **its** reach along the direction the drawing points. An arm drawn
dead straight comes out dead straight, on any character, at any size.

Order matters too. A foot is aimed **after** the leg above it is solved, not
with the rest of the body: the solve turns the thigh and the shin, and a foot
aimed before that is simply carried wherever its parents end up. That looked
harmless and was the single largest error in the whole rig — every one of
Yuji's forty frames had a foot between 50° and 170° off the drawing, which is
a foot pointing at the ceiling. Measured the same way afterwards, the worst
frame on the sheet is 6° and thirty-six of the forty are under 1°.

Four of the rows above exist because of what the reads could not previously say.
The clavicles are aimed with their reach ACROSS the body preserved and only
the up/down, fore/aft part turned — aim a clavicle flat into the drawing's
plane and both shoulders collapse onto the spine, dragging the collar with
them. And the neck aims from the **shoulder line**, not from the read's own
`neck` joint: the rig's Neck bone starts between the shoulders while the neck
joint is drawn halfway up a neck, and measuring from the higher point
over-stated the bend by the same few degrees on every frame. Every upright
frame in Yuji's sheet craned forward by 8.1° — the identical number three
times over, which is the signature of a convention error rather than a
reading. From the shoulder line it is 5° in the idle and 0° in the jab.

## What is read, and what is only seeded

| | |
|---|---|
| **Read by eye** | `yuji` — all 40 frames, each checked against the art, then re-checked against the posed rig |
| **Matched by hand** | all 40 of Yuji's frames, to a named human pose in `battle_poses.js` |
| **Fitted seeds** | every other character, 1237 frames, from `tools/pose_seed.py` |

A seed is Yuji's read of the same-named frame, fitted to this character's own
ink bounding box and pulled onto the drawing. It works as a starting point
because every sheet was drawn to one brief ([`pose-brief.md`](pose-brief.md)),
so `crouch_a` means the same thing everywhere; it is only a starting point
because the bodies do not match — Panda, Jogo and Mahoraga are not built like a
teenage boy, and their seeds show it. Every seeded pose carries a `seed` stamp
that the editor displays and that disappears the moment a human moves a joint.

## The other way round: matched battle poses

Everything above works forwards from the drawing — read the joints, infer the
depth, solve the rig onto them. It answers *where are his limbs* and it cannot
answer *is this a pose a fighter would be in*, because a read has no idea what
a fighter is. Two frames apart can read as two unrelated bodies, a foreshortened
forearm reads as an arm that is simply short, and nothing objects, because
nothing in the pipeline knows what a jab looks like.

[`render3d/src/battle_poses.js`](../../render3d/src/battle_poses.js) works the
other way. Each frame is **matched** to a named human pose — an orthodox boxing
guard, a rear-hand cross at full extension, mid-swing of a sprint stride, a
sprinter's three-point set — and the rig is put in that pose directly. The
drawing chooses *which* pose; the pose itself comes from how bodies are built.
All 40 of Yuji's frames have one, and the editor marks them with a dot.

The trade is worth stating, because the editor's **Matched** checkbox exists to
let a human make it frame by frame: a matched pose does not track the drawing
joint for joint, and in exchange it is never anatomically nonsense, never
inconsistent with its neighbours, and never needs depth inferred, because it
was authored in three dimensions in the first place. Matched is the default;
turning it off shows the same frame solved from the read, in the same pane, so
the comparison is one click.

### Where the numbers come from

Measured human movement, wherever a measurement exists:

| | |
|---|---|
| Orthodox stance | feet ~shoulder width and staggered, rear foot ~45°, knees "sitting" |
| The cross | proximal-to-distal; hip extension the largest contributor; peak-speed order hip → shoulder → elbow → wrist, so the contact frames drive the SPINE and the arm merely arrives |
| Sprint gait | hip 55° flexion in late swing, ~10° hyperextension after toe-off; knee ~125° at mid-swing, ~40° at strike, ~60° loading |
| Three-point start | front knee ~90°, rear knee ~120–135°, trunk ~45° to the ground, hips above the shoulders |
| Drop landing | peak knee flexion ~80–86°, and trunk flexion is what absorbs the force |
| Roundhouse kick | pelvis leads, then hip flexion with the knee extending through; ankle stays dorsiflexed |

Where Yuji disagrees with the generic pose, **the drawing wins** — the five
frames in the audit table below are matched to what he is drawn doing, not to
what the state is usually drawn doing.

### The angles are in the FIGHTER's frame, and it is measured

A pose is `{Bone: [x, y, z]}` in degrees: x about the line through his
shoulders, y about the vertical, z about his facing, composed z → y → x, from a
T-pose. Two things make that portable, and both had to be built:

  * **The rig is swung into a T-pose first.** A delivered `.glb` is not bound in
    one — Yuji arrives with his arms already at his sides — so adding a table's
    "arms down" to arms that are already down swings them 65° past his legs.
  * **The frame is measured off the rig, not assumed.** Yuji's lateral axis runs
    about 20° off the world's, so a table applied raw turns him to face away
    from the camera.

Every axis sign was established by rotating one bone and asking where the hand
went, and the guesses kept coming back backwards. First the punches: with the
sign taken from the delivery spec rather than the rig, every one on the sheet
was thrown over his shoulder. Then the arms: `+x` put **both hands 15cm behind
the chest on every frame**, which is what "his arms are tucked behind his back"
looks like from the front.

Both have the same cause, and it is worth keeping in mind for the next table.
`x` turns about the line through the shoulders, so it tips the **top** of the
spine forward and the **bottom** of a hanging arm backward — same rotation,
opposite ends of the vertical.

The elbow is the other trap, and it is not a sign error but a plane error. An
elbow is a hinge **perpendicular to the upper arm**, so it belongs on `x`; bend
it about the facing axis and the forearm sweeps sideways across the body, which
from the side reads as a hand tucked behind. And the axes are deliberately
**not carried down the chain** — carrying them rotates "lateral" until it runs
along the upper arm, and an elbow asked to hinge about its own bone just
twists. Measured: a hanging arm with a 110° elbow came out perfectly straight.

`window.__handsAt()` in the editor reports where both hands sit relative to the
chest in the fighter's own frame. It exists because "his hand looks wrong" is
not reviewable and "his hand is 15cm behind his chest" is. Two rules catch most
of it: a hand doing nothing belongs in **front**, and an elbow nobody lifted on
purpose belongs near the **ribs**.

`tools/check_battle_poses.mjs` runs in `npm run check` and guards the three
things that rot silently — a bone renamed, a frame added, an angle typo'd past
what a joint reaches.

## Is a read accurate enough to author from?

On the character that has been read properly: in the drawing plane, yes.
`python3 tools/pose_contact_sheet.py yuji --check` measures every joint to the
nearest opaque pixel and 719 of 720 land on the art; at overlay the figure
tracks hip height, knee bend, stance width and reach closely enough to build a
clip from. Out of plane, no — which limb is nearer, and how far a fist travels
toward camera, is inference from overlap and shading, and needs a human.

The read being accurate and the **rig** being accurate are separate questions,
and asking the second one is what `pose_rig_sheet.mjs` is for. Yuji's reads
were passing every flat check at a point when the interpreter was still
pointing his feet at the ceiling on all forty frames and folding his punches up
at the chest — neither of which a joint-on-the-ink test can see, and both of
which are obvious the moment the rig is drawn beside the drawing.

The failure mode is not a wrong limb but a *plausible* one: a fist placed on
the sleeve instead of the fist, an elbow slid along a forearm. Those survive
prose and die under the overlay, which is why the sheet draws rather than
describes.

## What Yuji's read found

Six of his frames carry no pose another frame does not already carry:
`special_down` is the idle with a wisp of aura, `ult_a` and `ult_b` are
skeletally the heavy's contact frame, `idle_b` and `attack_light_b` repeat
their partners. `attack_heavy_a` is the only true anticipation drawing on the
sheet — everything else labelled `_a`/`_b` is two contacts, not wind-up and
strike. All six run frames lead with the same leg, so the sheet is one
half-cycle and the other half must be mirrored, which is already how it is
built (`mirrorClips` in [`clips.js`](../../render3d/src/clips.js)).

### Where Yuji disagrees with the pose audit

[`sprite-pose-audit.md`](../../billboards/docs/sprite-pose-audit.md) set the
default poses from full sheets for Choso, Yuki and Nanami. Five of its verdicts
do not describe what Yuji is drawn doing:

| State | The audit's default | What Yuji's sheet draws |
|---|---|---|
| `crouch` | a deep squat, thighs near horizontal | a sprinter's **three-point stance** — a hand planted on the floor, rear leg stretched back. `crouch_attack_a`/`_b` lunge out of it |
| `ledge` | both arms overhead on the grip | hangs from **one** arm, the other at his side |
| `land` | one hand dropped toward the floor | **both** hands reach forward and down |
| `dizzy` | a forward slump, head lolling | tips **backward**, chin up, arms dead at the sides |
| `jump` | stretched upward, legs still extending | knees **already tucked** at the rise |

`hurt` is a near miss rather than a contradiction: the audit flung the arms
wide, and Yuji's arms hang loose — the reaction lives in the arched spine.

None of this makes the audit wrong. It sampled three fighters and applied the
result to all of them, and Yuji is drawn differently. The conclusion is about
scope: a default pose set derived from a sample needs a per-fighter check
before it stands in for that fighter's clip. The reads are that check, and the
editor is how the rest of the roster gets one.

## Nothing here changes what the game draws — yet

The reads are upstream data. No clip table, rig manifest or default pose reads
them, so a wrong seed cannot make a fighter pose wrongly in a match. Wiring
them into the clip tables is the step after a character's reads are finished
and reviewed.
