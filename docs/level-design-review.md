# Level Design Review — platform geometry vs. fighter size

A pass over the 20 boards in `src/stages.js`, measuring platform sizes and
counts against the fighters that stand on them, with Smash Bros.' stage
variety as the reference point. Follow-up to the Phase 2 archetype work in
[stage-variety-plan.md](stage-variety-plan.md) — this review takes the
archetypes as given and asks whether the *proportions* serve them.

**Status: implemented, and G1(a) taken a second step.** The roster is now 70%
of the size it was after the first pass (`ART_SCALE` in `config_tuning.js`,
`HEIGHT_BASE_PX` 149 → 104.3), with the camera zoomed in by the reciprocal so a
fighter lands on screen exactly as large as before — what changed is the space
around them, not the picture. Mains went 5.3 → 7.6 body heights, a full hop
1.06 → 1.51, a double 1.95 → 2.78, tier steps 0.6–1.0 → 0.8–1.3. Smash, for
scale: 11–14, 2.6, 5.2. Everything fighter-SIZED followed the bodies so the
scale does not read as changed — the ground shadow, every particle, ring and
popup, the platform slab's thickness, the camera's own pads — while everything
BOARD-sized (platform lengths, blast zones, spawn spacing) deliberately did
not. §1's measured baseline below is from before that step.

**Status: implemented** (same branch, follow-up commit), with the user's two
additions: G1 landed as (a) *and* a mild (b) — `HEIGHT_BASE_PX` 175.3 → 149
and every jump impulse +10% (710–800 → 780–880, single rise 129–165 px) — and
the camera got Smash-style dynamic framing (`camera.js`): the alive fighters'
padded bounding box picks the zoom, up to 1.32× on close fights so the smaller
roster still reads large, padded 280 px above vs 120 below so top space wins
and the main platform sits low in the frame. Everything in §4 landed as
written, plus: Garden Steps' risers restretched to 110/90/90 and Billboard
Roof rebuilt as a real tower (ledges 470 → mid 370 → summit 262) under the new
jump envelope; Bone Sanctum's ribs restretched to 118/110/110 steps; spawns
now land on the lowest platform under their x (Battlefield-style) so narrow
mains can't drop an outer spawn into the void. The per-board "optional" items
landed too (Quiet Hall's rafter lean, Curse Maw's molars moved outward, School
Wing's 130/170 balconies). The one thing deliberately NOT done is the
split-main board — G6's Phase 3 candidate, which needs per-stage spawn logic
first. The sections below are the original review as written.

## 1. The measured baseline

Everything below is read from `constants.js`, `config_tuning.js`,
`characters.js`, `silhouette.js` and `stages.js`.

| Quantity | Value |
|---|---|
| World | 1280 × 720, fixed (`WORLD`) |
| Blast zones | left −300, right 1580, top −420, bottom 1000 |
| Fighter standing height | 147–200 px (`HEIGHT_BASE_PX` 175.3 × ratio 0.84–1.14) |
| Fighter body width | ~0.38 × height ⇒ ~56–76 px typical |
| Run speed | 402–468 px/s; air speed 305–380 px/s |
| Single jump rise | 107–136 px (impulse 710–800 at gravity 2350) |
| Single + air jump | ~198–250 px |
| Main platforms | w 660–920, h 42, y 566–584 |
| Drop-through platforms | w 150–340 (one 520), h 20–22 |
| Tier steps | 80–140 px (cap ≤140, `audit_stage_reach.mjs`) |
| Highest-platform cap | y ≥ 235 |

Two derived ratios drive most of what follows:

- **A main platform is ~4–5.5 body-heights long.** Battlefield's floor is
  ~12–14 Mario-heights; even small Smash stages run 8+. These boards are,
  in Smash terms, all *small* stages — a deliberately denser brawler.
  That's a legitimate identity, but it narrows the range of situations:
  neutral resets, camping space, and long dash-dances barely exist.
- **No fighter can single-jump their own height** (max rise 136 px vs.
  shortest fighter 147 px), and the tier-step cap (140 px) is *below*
  standing height. Every layered board therefore stacks platforms closer
  together than a body: a fighter on the main pokes head-and-shoulders
  through the side-platform layer, and on Bone Sanctum's 80 px steps more
  than half the body overlaps the tier above. In Smash a platform hop is
  1.5–2 character heights of clearance; here layers interpenetrate.

## 2. Global recommendations

Ordered by leverage.

### G1. Fix the vertical scale — one lever, three options

The compressed vertical band (main ~570 → cap 235 ≈ 335 px, barely two
body-heights of layered play) is the single biggest divergence from
Smash-style dynamics: juggles, platform tech-chases, and top-KO setups all
live in vertical space this game doesn't have. Pick **one**:

- **(a) Shrink fighters ~15%** (`HEIGHT_BASE_PX` 175.3 → ~149). Every board
  gets longer *and* airier at once with zero stage edits: mains become
  ~5.3–6.5 body-heights, tier steps land at ~parity with body height, and
  the fixed camera framing is untouched. Cheapest, most uniform win;
  cost is a slightly less "big sprites" look.
- **(b) Raise jumps ~15–20%** (impulses 710–800 → ~820–920, single rise
  ~145–180 px) and lift the tier-step cap to ~180 px. Boards then *earn*
  their spacing — side platforms could sit 160–180 below-cap steps apart
  instead of 110–140. Requires re-running `audit_stage_reach.mjs` with new
  constants and re-spacing most layered boards.
- **(c) Accept the dense-brawler identity** and instead push *horizontal*
  variety harder (G2). Valid, but then several 3-tier boards (Bone
  Sanctum, Shibuya Night) should shed a tier, because layers under one
  body-height apart mostly add clutter, not situations.

Recommendation: **(a)**, possibly paired with a mild version of (b).

### G2. Widen the size *range* of mains, not every main

Mains span only 660–920 px — every board is "medium." Smash's variety comes
from the spread (Final Destination vs. Fountain vs. tiny duel stages):

- **Small end:** Bridge Duel 660 → **~560** (x 360). It's the declared duel
  board and it drifts ±70; a genuinely small, scary main makes it the
  "Yoshi's Story" of the set.
- **Big end:** push one or two crowd boards to near-full span: Academy Hall
  920 → **~980** (x 150), Sunken Crossing 900 → **~960**. These are the
  boards Battle Royal (8 spawns across x 320–960, ~91 px apart —
  shoulder-to-shoulder at 56–76 px body widths) most needs.
- Consider steering crowd modes (5+ fighters) toward the wide-main boards,
  or widening `CROWD_SPAN` on them.

### G3. Minimum length for *contested* platforms: ~3 body widths (≈210 px)

A platform two fighters actually fight on needs room for two ~70 px bodies
plus spacing. Several boards sit under that line where the archetype says
"fight here":

- Bump: Bone Sanctum tops 170 → 200; Cursed Teeth top 170 → 195;
  Flooded Gate islands 180 → 200; Lantern Corridor rafters 190 → 210
  (lanterns land on them — you want to *stand* there); Neon Split uppers
  180 → 200.
- Keep sub-180 **only** where "perch, not arena" is the point: Crosswalk
  Rush signs (150), Billboard Roof strike-top approach ledges, Mist Pier
  lantern post (150), School Wing upper balconies (150). Those are the
  Islands/Overpass identity and should stay cramped.

### G4. Thickness: thin the drop-throughs, keep the mains

Drop-throughs are 20–22 px ≈ 11–15% of body height — in Smash's ballpark,
so nothing is *wrong*. But because tiers sit so close (G1), a fighter
attacking through a platform from below is common, and a thinner sliver
reads better and shaves hitbox occlusion. Suggest **14–16 px** for all
`side`/`top` platforms (pure `h` edit, no reach implications — the audit
cares about the top surface y). Mains stay 42: they're the ground and
should read heavy.

### G5. Protect the open sky

The Arena boards (Quiet Hall, Curse Maw, Sunken Crossing, Bridge Duel) are
the only ones with real air above the fight, and they play differently
because of it — that *is* Smash's Pokémon Stadium value. Two guardrails:

- Don't add tops to Arena boards in future passes.
- On 3-tier boards, the y ≥ 235 cap leaves under one jump of air above the
  summit. If G1(a)/(b) lands, revisit the cap (e.g. 265 with smaller
  fighters) so the top platform isn't pressed against the ceiling.

### G6. More asymmetry and one exotic ground shape

Garden Steps and River Gate are the only asymmetric boards; Smash leans on
asymmetry for stage-positioning stories (strong side / weak side). Cheap
additions within current engine support:

- **Empty City:** offset the two rooftop pairs (e.g. left pair one tier
  lower than the right) — ruins are naturally uneven, and the crumble
  gimmick gets a directional flavor.
- **Mist Pier:** docks at slightly different heights (462 / 440) — piers
  sag; the fog gimmick rewards memorizing an uneven silhouette.
- **The one genuinely new shape:** a board whose main has a *gap* (two
  grounds, a center pit — Frigate/temple energy). This is the largest
  unexplored dynamic: center KOs, pit-edge scrambles, two-ledge recovery
  choices per side. Engine caveat: spawn/respawn logic assumes one main
  under x 250–1030 (`mainPlatform`, `spawnXs`), so it needs a per-stage
  spawn override before any board can try it. Flagging as a candidate for
  a Phase 3, not a quick edit.

### G7. Billboard Roof's 80 px "ledges" are curbs, not platforms

The 150-wide side ledges at y 500 sit 80 px above the 580 main — under half
a body. A fighter standing beside one overlaps it entirely; as platforms
they add ambiguity (accidental drop-through inputs, ledge-grab noise near
the main's real ledges) without adding a position. Either raise them to
~470 (a real 110 px first step toward the tower) or drop them and let the
tower be main → mid (440) → top (310), which is already a clean climb.

## 3. Per-board notes

Boards not listed are proportionally sound for their archetype
(Training Bridge, Shibuya Night, Garden Steps, Sunken Crossing, Neon Split
towers-spacing, Academy Hall, Crosswalk Rush, River Gate, Domain Core).

| Board | Observation | Suggestion |
|---|---|---|
| Quiet Hall | Arena rafters 270 wide are fine, but both at y 438 makes the board mirror-flat for a "hush" theme that could feel off-balance | optional: drop one rafter to 452 for a subtle lean |
| Flooded Gate | islands 180 are refuges the surge pushes you toward — slightly too small to *hold* under pressure | 180 → 200 (G3) |
| Curse Maw | molars 220 @ 442 good; theme could bite harder — molars could sit closer to the fangs' edges | optional: move molars outward ~40 px so camping them means standing over the chomp zone |
| Lantern Corridor | rafters 190 with 115 px gaps; lanterns land on them | 190 → 210; gaps stay ≥ 95 px (>1 body width, still droppable) |
| Bone Sanctum | 6 plats over 80 px steps — densest board; bodies span two tiers at once | if G1 lands, restretch steps to ~110/110; else consider 5 plats (drop one top rib) |
| Bridge Duel | smallest main (660) *and* drifting — best identity in the set, could commit harder | 660 → 560 (G2); torii roofs overhanging the void are great, keep |
| Mist Pier | symmetric docks under fog | stagger dock heights (G6) |
| Cursed Teeth | top 170 is the funnel fangs fall through — fighting on it is the risk/reward | 170 → 195 so two fighters *can* contest it |
| School Wing | balconies 150 @ 330 are perches — fine — but both towers identical | optional: make one tower's upper balcony 130/other 170 for a strong-side |
| Empty City | crumbling rooftops symmetric | offset pairs (G6) |
| Billboard Roof | 80 px curb-ledges | raise to ~470 or remove (G7) |

## 4. Numeric quick-win summary (if implemented)

All `stages.js`-only, audit-safe under current physics:

- Thin all `side`/`top` platforms: `h: 22/20` → `h: 15` (G4)
- Bridge Duel main: `x: 310, w: 660` → `x: 360, w: 560`
- Academy Hall main: `x: 180, w: 920` → `x: 150, w: 980`
- Sunken Crossing main: `x: 190, w: 900` → `x: 160, w: 960`
- G3 length bumps: boneSanctum tops 170→200, cursedTeeth top 170→195,
  floodedGate sides 180→200, lanternCorridor rafters 190→210,
  neonSplit uppers 180→200
- Billboard Roof: side ledges `y: 500` → `y: 470` (or delete)
- Mist Pier: right dock `y: 462` → `y: 440`; Empty City: left rooftop pair
  down one half-step (`y: 326` → `y: 360`, left low plat `y: 446` → `y: 470`)

The bigger levers — fighter scale (G1a), jump impulses + step cap (G1b),
split-main spawn support (G6) — touch `config_tuning.js`, `characters.js`,
`constants.js` and `tools/audit_stage_reach.mjs`, and should be their own
pass with the reach audit and `tools/smoke_stages.mjs` re-run.

## 5. Second widening — six players, walk-offs, walls (implemented)

A later pass with two goals: seat SIX fighters without the fight turning to
mush, and pull more of Smash's terrain vocabulary into the set. All of it is
`stages.js` geometry plus one AI rule; `tools/audit_stage_reach.mjs` stays
green with zero warnings.

**Wider ground, wider edges.** Every main grew ~40–80 px (Bridge Duel kept
small on purpose, 560 → 600) and the outermost side platforms moved out toward
the screen edges (left lips now start as far out as x≈130–180 instead of
x≈150–260, mirrored on the right). Main widths now spread 600 → 1192.

**Walk-offs (Smash: Smashville edges, Duck Hunt ground game).** Two boards run
their main past both world edges and sit it at the bottom of the world, so the
match lives at ground level and the kill is a shove past the screen edge rather
than a spike:

- *Sunken Crossing* — `x: -140, w: 1560, y: 668`; on the slick surface every
  slide is a threat the whole way across.
- *Crosswalk Rush* — `x: -140, w: 1560, y: 664`; the traffic hazard already
  sweeps the main, so it now sweeps the whole street. The overpass deck and its
  sign perches came down in step so every hop stays inside the comfy budget.

**Why 1560, and why the first attempt at this failed.** The first pass sized
these against WORLD coordinates (0–1280) and set the mains to ~1180 wide
starting at x≈50 — 3.4% off the world edge, which read on screen as a platform
floating well inside its background. The world rect is not the frame. What the
eye judges is the gap beside the platform ON SCREEN, and that gap belongs to
the CAMERA: `updateCamera` fits the alive fighters plus `FRAME_PAD_X` (240 ×
ART_SCALE = 168 world px) on each side, so with a fighter standing at each end
the margin is ~138 world px × zoom on ANY board. Widening a board just makes
the camera zoom out to restore the same padding. Measured on the shipped 2.5D
camera, fighters pinned 30 px inside each end:

| Board | main w | zoom | gap L/R (screen px) |
|---|---|---|---|
| Sunken Crossing (first pass) | 1192 | 0.873 | 120 / 119 |
| Training Bridge | 844 | 1.145 | 158 / 156 |
| Bridge Duel | 600 | 1.465 | 208 / 194 |

All three are the same 138 world px, scaled by each board's zoom. The one thing
that closes the gap is running OUT of zoom: the camera bottoms out at
`ZOOM_MIN` 0.78, a frame 1641 world px across, so a board whose fighters can
stand more than ~1305 apart cannot be padded further and the platform is forced
to the edges. At w = 1560 (ends x = -140 and 1420) the camera pins to 0.78 and
the measured gap falls to **33 / 31 screen px** — about 2.5% of the width. The
blast lines (-300 / 1580) stay 160 px past each end, so a walk-off kill is fast
but not instant.

Two knock-ons this made necessary. `VIEW_BLEED` is 400, so the backdrop already
covers world -400…1680 and a platform starting at -140 still sits on painted
background. And the crowd spread is now capped at `CROWD_SPAN_MAX` 1100
whatever the board's width — spreading six fighters over all 1560 px would have
stood the outer two within one launch of the blast line before the match
started; they now start 220 px apart across 90…1190.

The remaining ~245 px of background below the platform is also the camera's,
not the board's: at zoom 0.78 the frame is 923 world px tall against a 720 px
world, so some below-world bleed is always in shot. Closing that would mean
re-tuning `FRAME_PAD_TOP` / `FRAME_PAD_BOTTOM`, which changes every board's
feel and is deliberately left alone here.

**Walls (Smash: walled stages, Shadow Moses pillars).** `{ kind: "wall" }`
existed only for the character bench; two boards now build them for real:

- *River Gate* — the torii's two legs (30×130) stand on the main flanking the
  center: a dueling pit between them, perch tops above, and the crosswind can
  pin an airborne fighter against a leg.
- *Cursed Teeth* — a molar (34×60) juts up near each end of the jaw, low
  enough to hop but tall enough to catch a grounded launch; the fight pools in
  the bowl, with a bare teeter-lip outside each tooth.

Support that made walls real-stage-safe: the ART_SCALE slab-thinning pass
skips walls (their height is collision, not slab art), and the CPU hops a wall
that stands within ~110 px of its walking direction instead of pushing on it
forever (`ai.js`).

**Six-player spawns.** The crowd spread (5+ fighters) now spans THE BOARD'S
main platform (70 px off each lip) instead of the fixed 320–960 window, so
the widened boards actually buy a crowd elbow room: six on Sunken Crossing
start ~210 px apart, and on the narrowest board every spawn still lands on
solid ground. Hand-placed 2/3/4 spacings are untouched.

**Considered and skipped:** slopes (the platform model is axis-aligned rects
throughout — collision, ledges, teeter all assume a flat top), a true flat
Final Destination board (the audit's 2-minimum on non-main platforms is a
deliberate archetype rule), and moving hazards beyond what Active Boards
already does.


## 6. The frame remembers the high ground (implemented)

§5 left ~245 px of backdrop under the platform and said closing it meant
re-tuning the camera's pads for every board. That was the wrong lever. The
right one is that the waste is not constant — it is what is left over when the
fight is on the floor, and it disappears on its own whenever the fight climbs,
because the framing box grows upward to hold the high bodies and the ground
drops down the screen. The camera was simply throwing that away the instant
everyone landed.

So `camera.js` now keeps a **high-play envelope** (`highPlayBias`, `cam.highT`):

- **drive** — how far the highest alive fighter is above the main platform, as
  a fraction of `HIGH_REF` (240 px, about a double jump's rise). 0 on the
  ground, 1 on a top platform.
- **attack** (`HIGH_ATTACK_DAMP` 0.5, ~1.4 s) — rising. Quick enough to follow a
  fight that moves upstairs, slow enough that one hop barely registers, which is
  what makes it "using the top of the screen *a lot*" rather than "jumped once".
- **release** (`HIGH_RELEASE_DAMP` 0.9, ~9.5 s) — falling. The ground stays low
  well past one player touching down, and only a real return to floor-level play
  eases it back.
- **bias** — `HIGH_BIAS_MAX` (170 × ART_SCALE) × `highT`, subtracted from the
  framing target `cy`.

This is the standard shape for "react fast, forget slowly" — an **attack/release
envelope**, the same asymmetric damping Cinemachine applies to a framing target,
and the same trick this file already played on the zoom (`ZOOM_IN_DAMP` vs
`ZOOM_OUT_DAMP`: settle slowly, open instantly). One state variable, two rates,
no modes and no thresholds to tune per board.

It is a **preference, not a guarantee**: the containment pass still owes every
body a place in frame and overrides the bias whenever it binds, so remembering
the high ground can never be the reason somebody leaves the shot.

Measured on Training Bridge (`tools/smoke_camera.mjs`, "the frame remembers the
high ground"): ground play `highT` 0; four seconds on the top platform 0.94;
one second after landing 0.83 with the ground still sitting ~90 px lower in
frame than its floor-play baseline; twelve seconds later 0.24 and easing back.

## 7. The arena bench

`/workbench/?edit=arena` (`workbench/arena.js`) — pick a board, drag its
platforms, drive a fighter over them, export the numbers. It runs the game's own
`draw`, `advanceWorld` and `makeFighter`, so what it shows is what a match
shows.

- **Editing mode** (default on) pins the camera at `ZOOM_MIN` — the furthest the
  game ever pulls back — and holds it there, because a framing camera is a
  moving target and the thing under the cursor must not move as you reach for
  it. Turn it off and the game's camera takes over, which is how the board's
  *feel* gets judged.
- **Guides** drawn in editing mode: the painted world rect, the blast lines, and
  the widest shot the game will ever give this board. That last one is the frame
  a platform has to reach to look like it reaches the edge — the exact thing §5
  got wrong by measuring against the world rect instead.
- **Levers**, per board: `gravityMul`, `frictionPow`, tint, Active Boards
  (off by default while editing — several boards move their platforms, which
  fights the thing you are dragging).
- **Live reach report** — the same budget `tools/audit_stage_reach.mjs`
  enforces, so a board that cannot land in `main` says so while you are building
  it rather than in CI.
- **Export** downloads `arena-<key>.json`: the authored numbers plus a
  paste-ready `src/stages.js` line.

The one trap worth knowing about: `stages.js` multiplies every platform's
thickness by `ART_SCALE` **in place**, so the live table's `h` is not the number
anybody typed. The bench edits `AUTHORED_STAGES` — a copy taken before that pass
— and rebuilds the runtime platforms from it with the same rule. Without that, a
round trip through the bench would shave 30% off every slab, every time.
`tools/smoke_arena_bench.mjs` asserts it: a main platform exports as `h: 42`
while the world is running it at 29.


## 8. The floor is not where you start (implemented)

Reported from play: every board except the two walk-offs sat its lowest ground
around y≈570 in a 720-tall world, so roughly a third of each board was scenery
you could never stand in. The fix is not to move the fight down — it is to stop
conflating **the lowest ground** with **where a match opens**.

Every board that gained a storey now has two things where it used to have one:

| | |
|---|---|
| **the floor** | `kind: "main"` — the lowest ground, the grabbable ledges, y 686–700 (the walk-offs' 664/668 for company) |
| **the starting tier** | `kind: "spawn"` — a drop-through at exactly the y and width the old main had. A match opens here, the crowd spreads across it, and you can leave it downward whenever you like |

The tier is always one climb off the floor (measured rises: 116–120 px, against
the reach audit's 145 comfy limit), so being knocked below the starting line is
a position to fight out of rather than a death. A ledge hang on the floor sits
low in frame on purpose — being able to *use* the bottom of the board is worth
more than seeing all of a hanging body.

**Six boards split that floor in two**, with a ~190 px hole down the middle:
Shibuya Night, Bone Sanctum, Mist Pier, Empty City, Billboard Roof and Domain
Core. The starting tier still bridges the gap, so a match opens on solid ground
and the hole is something you choose to deal with — four grabbable ledges
instead of two, and a way to lose a stock straight down the middle. The six were
picked for gimmicks that never measure the main (`stage_fx.js`): a board whose
hazard sweeps its floor keeps that floor in one piece.

**Four boards deliberately keep a high floor**, because a floor underneath would
cost them what they are. Sunken Crossing and Crosswalk Rush are walk-offs whose
street already *is* the bottom of the world. Bridge Duel is a narrow bridge over
a void — catching yourself on a floor below is exactly what that board is meant
not to offer, and its gimmick drifts that bridge. Garden Steps is a staircase,
and a staircase reads from its bottom step. Which boards gain the storey is a
per-board decision, not a rule.

### What this touched, and the traps in it

- `stages.js` gains `mainPlatforms()` (every piece of lowest ground),
  `groundSpan()` (how far the ground reaches, across a split) and
  `spawnPlatform()` / `groundY()` (the starting tier).
- **Ledges.** `tryGrabLedge` read only the *first* main, so half of a split
  board's ledges were dead to the touch — including both lips facing the hole,
  which are the point of splitting it. It iterates every main now.
- **Spawns.** `spawnSpot` picked the *lowest* surface under an x, which is now a
  storey below the start. The tier wins wherever it is underfoot; everywhere
  else the old rule stands, which is what still puts Bridge Duel's outer slots
  on its side platforms.
- **Ground effects.** Eight sites across `ultimates.js`, plus `combat.js`,
  `domains.js`, `specials.js` and `summons.js`, read `state.platforms[0].y` as
  "ground level" for shockwaves, slams and summon placement. Left alone they
  would have drawn every one of them 120 px under the fight. They call
  `groundY()` now, which returns the starting tier — the same number they have
  always got.
- **Gimmicks that filter by kind.** Bone Sanctum phases "every non-main
  platform" and Academy Hall glides them into four indexed layouts; a fifth
  platform in that list would have phased the tier out from under a match and
  glided everything to the wrong position. Both exclude `spawn` now. Domain
  Core orbits `kind === "side"`, which is why the tier got a kind of its own
  rather than a flag on `side` — the filters that should skip it now do so for
  free.
- **The CPU.** `groundSpan` reads straight over a split floor's hole, so the AI
  gets a second rule: while standing on the floor, don't back into a gap.

`tools/smoke_stage_floor.mjs` covers the invariants; `audit_stage_reach.mjs`
now understands one-or-two mains, checks a split floor's halves are level with a
real hole between them, and checks the tier is wide enough and within a hop.

## 9. The arena bench grows an editing layer

`/workbench/?edit=arena` gains what any editor needs once boards are made of
more than four rectangles:

- **Multi-select** — shift/ctrl-click to add, drag on empty space to marquee
  (touched, not enclosed, so catching a 1500 px floor doesn't mean starting the
  sweep off the board), `ctrl+A` for all, `esc` for none. A group drags as one:
  the offset is applied to where each platform *started*, so rounding cannot
  shear a group apart over a long drag. Resize handles appear only on a single
  selection — a resize means one platform, and drawing grips on a group would
  promise a gesture that does nothing.
- **Copy/paste** — `ctrl+C`/`ctrl+V`, `ctrl+D` to duplicate. The clipboard holds
  authored *shapes*, not indices, so a copy survives any edit made before it is
  pasted, including deleting the originals. Pasted copies land offset and become
  the selection, and the clipboard follows them down so pasting twice makes a
  staircase rather than a stack.
- **Undo/redo** — `ctrl+Z` / `ctrl+shift+Z` (and `ctrl+Y`), over whole-board
  snapshots. A board is a few dozen small objects, so a snapshot is cheaper than
  a delta log and cannot drift out of step with the screen. The property that
  buys: **an edit is one step whatever it touched** — a drag that moved both
  halves of a split floor undoes once, as does a paste of three platforms or a
  group delete. A press that never moved pops its own snapshot rather than
  costing an undo.

The reach panel mirrors the audit's new rules, so the bench says what CI will,
and the kind list gained `spawn`.

## 10. The bench shows the board's real shape

Two viewing fixes, both reported from use.

**The picture was squashed.** The canvas filled its box and took its transform
as `width / 1280` by `height / 720` — two independent scales — so any box that
was not 16:9 stretched the world to the window's shape. Measured before the
fix, a 1500x860 window drew the board into a 934x707 stage: a **34% vertical
stretch**, on the one bench whose entire job is judging where a platform sits.
The `object-fit: contain` in the stylesheet could never have helped, because the
bitmap was always sized to match the box exactly — there was nothing left to
fit.

`layoutCanvas` now sizes a frame to the largest 16:9 box that fits the space,
fills it with the canvas, and takes **one** scale for both axes (from the width,
so rounding the bitmap to whole device pixels cannot leave the two ratios a
thousandth apart). `tools/smoke_arena_layout.mjs` asserts the property the way
the eye does: a 200x200 square in world space has to come out square on screen,
at every window shape.

**The side panels fold.** A grip on each panel's inner edge collapses it to a
26px rail — the button that brings it back stays where the panel was, so hiding
one is not a thing you can only undo by knowing the URL. `[` and `]` do the same
from the keyboard, and the state rides in the URL with `stage` and `editing`, so
a link carries the layout you were looking at the board in. With both folded the
picture goes from 934 to 1310px wide on a 1500px window.

The character bench (`workbench/character.js`) has the same two-scale transform
and would squash the same way in a non-16:9 box; it was left alone here because
nothing asked it to change, not because it is right.

## 11. What actually bounds a board

Three limits the audit was enforcing turned out to be inherited numbers rather
than measured ones, and all three were costing usable board.

**The top cap was 235**, chosen so a full jump from the highest platform could
not pass y = 0. That is not a safety line: y = 0 is the top of the world *rect*.
Above it there is painted backdrop (`VIEW_BLEED` bleeds the plate to −400) and
no danger (`BLAST.top` is −420). The limit that matters is that a fighter should
never end up *entirely* above the shot — partly offscreen at an apex is ordinary
in this genre. The camera can show up to y = −260 (`OVERSCAN_Y`, and the same
number at every zoom, because `cam.y ≥ halfH − OVERSCAN_Y` makes the frame top
`cam.y − halfH ≥ −OVERSCAN_Y`), and the strongest full jump rises 434px, so a
platform stops being safe at y ≈ 174. That is now a **warning at y < 170**, not
an error: nothing breaks up there, and whoever lays the board out is the
authority on whether the height is worth it.

**The hop ceiling was 175 against a real reach of 239.** `MAX_RISE` was a
"comfortable" number standing in for the physical one, so the audit called
platforms unreachable that a player could plainly double-jump to — reported from
the bench, where a hand-built board was fully reachable and the panel said
otherwise. The ceiling is the measured one now (235: the weakest jumper's 239px
full jump, less a few pixels for landing on a platform rather than touching its
height at the apex), and 175 became the *warning* threshold, which makes it an
honest band: a hop that works but wants a deliberate double jump.

**The budgets ignored gravity.** Rise goes as v²/2g, so Domain Core's
`gravityMul: 0.88` buys 14% more height — and judging its shards against
sea-level numbers called reachable hops uncomfortable. Every rise budget now
scales by the reciprocal of the board's own gravity. The top cap deliberately
does *not*: scaling it would make the one board that floats the most restricted
board in the set, which is backwards for the board whose whole idea is height.

**And the platform-count cap went 6 → 8 → 10**, which is an archetype guard
rather than a mechanical limit — a floor, a starting tier and an orbit field of
shards is nine before anybody has done anything unusual.

## 12. The bench holds more than one board

Reported from use: an afternoon's work on Billboard Roof vanished on switching
to Empty City, and a copy taken on one board had nothing to paste after moving.
Switching rebuilt the new board from the shipped table, threw the old one away,
and cleared the clipboard on the way past.

Each board now keeps its own entry — the arena *and* its own undo/redo stacks,
because "undo" after switching back has to mean the last thing you did to *that*
board. The clipboard is deliberately global and survives a switch: copying a
ledge arrangement off one board onto another is the whole reason a bench has a
clipboard rather than a duplicate button. The board list marks what you have
changed, and **Export carries every changed board at once** with a paste-ready
`stages.js` entry for each — the same bargain the audio bench's "Export changes"
strikes. A single-board export still reads exactly as it did.

## 13. The interface defers to the fight

The shot is framed into the strip under the damage plates (`camera.js`
`bandFrac`), so in normal play a fighter never reaches them. Boards can now be
built tall enough that the frame runs out of room — `clampView` will not look
higher than `OVERSCAN_Y` past the world — and at that point somebody fighting at
the top of the board is *behind* the readouts, which is the one thing an
interface must never do to the game it reports on.

**The camera moves first; the interface moves last.** `camera.js` publishes
`cam.atTop` after its final clamp — the only point at which it is true of the
frame that will actually be drawn — and `ui.js` `updateHudYield` fades a plate
only when the camera has already given up *and* a body overlaps it. Only the
plate that is actually covered: three other players' readouts have done nothing
wrong. Every live body is tested against every plate, because it is player 2
climbing into player 1's readout that hides player 1's damage.

**And it stays out of the way until the body has gone.** The trigger needs the
camera pinned; the *release* only asks whether they still overlap. A fighter
hovering exactly at the limit — where the camera is pinned one frame and free
the next — would otherwise strobe the plate. Hysteresis on the harder half of
the condition is the whole trick, and `tools/smoke_hud_yield.mjs` holds one
there for 150 frames and allows at most one change. It runs against both
cameras: the flat one projects with `cam.x/y/zoom`, the shipped 2.5D one has to
ask the rig, and being 20px out shows as a plate that fades late.

The plate fades to 0.14 rather than vanishing — you can still read your own
damage as a ghost behind the body, which matters most at exactly the moment you
are being juggled into the ceiling. True per-pixel layering (the fighter drawn
*over* the plate) would mean re-rendering the body into a layer above the HUD,
and the body lives on a different canvas in each backend — the 2D one in flat
mode, a WebGL billboard in 2.5D — so it would have to be drawn twice by two
different paths and would not match itself. Fading is the same promise kept with
one mechanism.

## 14. Test a board with the fighter who reaches least far

The arena bench defaults to the roster's **weakest jumper**, derived rather than
named so it stays true when somebody re-tunes a stat. A layout is only as good
as its worst case: if the shortest jumper can get everywhere, everyone can, and
if they cannot then the board has a hole in it that a tall jumper will hide from
you. Today that is Gakuganji and Tengen, tied at impulse 780 with one air jump —
129px on a single hop, 239px on a full one, against Uro's 434. The picker lists
every fighter's full jump beside their name for the same reason.

Two handle bugs went with it, both reported from use:

- **A wall could not be dragged taller.** There was no vertical handle at all,
  only the two horizontal ones — and a wall's height is its reach, not slab art.
  Walls now carry a height grip on their bottom edge, which grows them downward
  and leaves the top surface (the thing everything stands on) exactly where it
  is. Only walls: on every other kind `h` is thickness the `ART_SCALE` pass
  owns, and dragging it by accident while reaching for the body would be a
  change nobody asked for.
- **A narrow wall could not be picked up.** The two edge grab zones are a fixed
  margin wide — 14.1px each at editing zoom — so on a 30px wall they leave a
  **1.8px** band in the middle where "move" answers. Every attempt landed on a
  resize, and making the wall taller only offered more of the wrong thing to
  hit. The zones are capped at a quarter of the width now, which reserves half
  the platform for the body at any size and any zoom.

## 15. Wall jumping, and boards you climb

A jump pressed in the air while against a wall (`kind: "wall"`) pushes off it
**without spending an air jump**, so a tall wall is a route upward and a board
can be built to be climbed. The trade is Smash's: the wall jump is free and
repeatable, but taking one spends your air jump for the rest of that fall — you
can climb a wall all day, you cannot climb it and still have a double jump in
hand at the top. Landing, or catching a ledge, gives it back.

**The two numbers were measured, not guessed.** They started at 0.86 lift and a
300 push, on the reasoning that a wall jump should be weaker than an air jump
because it also throws you sideways. Driven up River Gate's 480px wall the way a
player would — hold into the face, jump on contact — that climbed **283px in 60
jumps and then stalled**: the shove threw the fighter so far off the face that
gravity took back more on the way in than the jump had gained.

So the push was what had to come down, not the lift go up:

| lift | push | climbed | jumps |
|---|---|---|---|
| 0.86 | 300 | 283px — **stalls** | 60 |
| **0.95** | **170** | **514px — clears the wall** | **11** |
| 0.98 | 140 | 496px | 10 |

0.95/170 gives about 47px of net height per jump: a climb you work at rather
than a free elevator. The lift ends up a shade *above* an air jump (0.92), and
that is right — it costs you the air jump for the rest of the fall and needs a
wall to do it against, so it should be worth having.

**The reach audit had to learn it too.** A wall you can get to makes everything
alongside its face reachable, whatever the rise from the nearest platform —
without that rule a deliberately vertical board reads as broken. River Gate went
from six "unreachable" errors to zero, and
`tools/smoke_wall_jump.mjs` closes the loop by driving a fighter up the real
wall on the real board rather than trusting the audit's arithmetic.

## 16. Three bench bugs that were all one bug

Reported: Delete "did not always work", undo "did not work" on a wall width, and
grabbing a handle could reselect a neighbour.

The first two were the same root cause, and it is a good one. Clicking the board
calls `preventDefault` to stop the drag becoming a text selection — and
`preventDefault` also suppresses the browser's **focus change**. So a click on
the canvas left the caret wherever it was, and if that was a property field then
every key afterwards went to the field: Delete typed into a number box, and
Ctrl+Z became the browser's *text* undo, which restored the old text, fired the
`input` handler, and wrote that value back to the platform — so the board
appeared to undo while the bench's own history sat untouched and the two drifted
apart silently. The canvas takes focus explicitly now, and undo answers wherever
the caret is.

The third is the rule as asked for: once something is selected, **its grips own
their pixels**. A wall standing on a shelf puts its handles right on top of that
shelf, and the shelf is drawn later, so reaching for the grip handed you the
shelf. The body underneath is still up for grabs, so clicking *into* another
platform still selects it.

## 17. One platform at a time

Reported from play: pressing down+jump to fall through a platform sometimes fell
through several. It did, and the mechanism was blunt — a drop switched off
**every** non-main platform for 0.24s, and 0.24s of falling is about 87px, so
anything stacked under the tier you meant to leave went with it.

The fighter now remembers the ONE platform being dropped through
(`f.dropThrough`) and ignores only that, so the next surface catches them
however close it is. That is also the answer to "don't drop me through a
platform with nothing below it": there is nothing special about the case, the
rule just stops after one. `dropTimer` stays as the safety net behind it —
identity is the rule, but a platform that phases out or is carried away
underneath (Active Boards) must not be able to strand the flag.

`tools/smoke_drop_through.mjs` builds a deliberately cruel stack — three
drop-throughs 40px apart, well inside the old blanket window — and asserts one
press falls exactly one shelf, a second press falls one more, and a shelf with
nothing under it still drops to the floor.

## 18. Hazards follow the mode

The arena bench keeps stage gimmicks still while you are editing, because
several boards MOVE their platforms or phase them out and one that walks away
from the cursor cannot be dragged. Turning editing off now **arms them**: half
of what a platform asks of a player is what the board does to it, and judging a
layout with the hazards switched off is judging a different board. The checkbox
still overrides either way, and flipping the mode re-syncs the platforms from
the authored geometry first, so a gimmick that had moved one does not leave it
wherever it stopped.

While fixing that, the bench's reach panel turned out to be **out of date with
the audit**: it had never learned that a wall is a route upward (§15), so it
reported five unreachable platforms on a board CI passes. A panel that
disagrees with CI is worse than no panel — it now runs the same rule.

Two audit rules were also softened, both toward letting the person laying out
the board decide:

- **Split floor halves no longer have to be exactly level.** A couple of pixels
  is a drag that landed a hair off, and a deliberate step between two halves is
  a design. Past `LEVEL_SLOP` (12px) it warns rather than fails.
- The highest-platform rule and the hop ceiling had already gone the same way
  in §11.

## The slab takes the room's light

Every board declared its ambiance once — `tint` in `src/stages.js`, the wash the
backdrop is painted through — and the platforms did not read it. One blue-grey
gradient with a gold lip was drawn on all twenty boards, so the same cold slab
sat in Lantern Corridor's amber and in Neon Split's magenta as if it had been
carried in from another game.

`src/stage_palette.js` derives the slab's colours from that same tint, so the
boards stay in sync with themselves: retint a stage and its platforms follow.
Both cameras read it — the flat renderer's gradient and lip (`drawPlatformShape`)
and the 3D extrusion's top, end and underside faces — so a board looks like one
board from either angle.

What is derived is HUE, and only hue:

- **The fill** takes the room's hue. The shipped gradient's stops keep their own
  lightness and (near enough) their own saturation, scaled by one factor per
  board so a muted room takes its slab down a little and a neon one up. The
  shipped spread from body to edge is kept but compressed to about an eighth:
  at full width the edge sits nearly opposite the body, which on an amber board
  lands a saturated blue over half the main platform and reads as two platforms
  welded together.
- **The lip** — the light *on* the slab — sits ON the board's hue rather than
  opposite it, so the brightest line in the drawing agrees with where the light
  in the painting comes from.
- **The drop-throughs** keep their own lip colour, offset from the main's by the
  same ≈152° the shipped gold and cyan had. That gap is not decoration: it is
  how a player tells solid ground from a platform they can fall through, and it
  survives on every board.

Lightness is never derived. A platform is read at a glance, mid-fight, against a
painted photograph; its legibility is the value structure, and that is a drawing
decision made once rather than something a stage's tint gets a vote on.
