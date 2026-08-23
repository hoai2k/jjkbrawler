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
