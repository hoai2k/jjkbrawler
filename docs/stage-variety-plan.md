# Stage Variety — Implementation Plan & Progress

Working doc for implementing [stage-variety-ideas.md](stage-variety-ideas.md).
**Update the checklist as work lands** so a fresh session can resume from here.

Branch: `claude/board-gameplay-variety-audit-9kifjf` → merge to `main` when done.

## Decisions (locked with the user)

- One Settings toggle: **"Active Boards"** (`state.activeBoards`, default **on**).
  Off = every board reverts to today's static layout: no hazards, no motion,
  no modifiers. (Simpler than the ideas doc's split of feel-vs-hazard.)
- All hazard/gimmick visuals are **procedural canvas drawings first**; optional
  polish sprites are requested as **round 9D** in asset-requests.md and, when
  they land, load as `optional` in assets.js with the procedural draw as
  fallback. The game must never require them.
- Domain Expansion already degrades cleanly without its 9C art (verified:
  `assets.js` loads `domain:*` as optional; `drawDomainBackdrop`,
  `effect:shrine`, `summon:rika` uses are all null-guarded). No work needed
  beyond keeping it that way.

## Architecture

- `src/stage_fx.js` (NEW) — everything stage-specific:
  - `STAGE_FX` registry: `stageKey -> makeFx(stage)` returning an entity
    (`{ owner: null, update(dt), draw(ctx), drawTop?(ctx) }`) pushed into
    `state.entities` by `initStageFx()` from `resetMatch()` when
    `state.activeBoards` is on.
  - Shared helpers: `stageHit()` (respects invuln/shield, light fixed knockback,
    never spikes), telegraph drawing, per-fighter hazard i-frames, platform
    move-with-carry (shifts grounded riders and ledge-hangers), phasing.
- `state.stageMods = { gravityMul, frictionPow }` — set by `initStageFx()`
  (neutral `{1,1}` when toggle is off). `state.hazardZones = []` — active
  telegraphed danger zones `{x, w, until}` that the CPU reacts to.
- `src/fighter.js` — gravity × `stageMods.gravityMul`; ground friction uses
  `Math.pow(st.friction, stageMods.frictionPow × (plat.frictionPow ?? 1))`;
  `resolvePlatforms` skips `plat.ghost` platforms.
- `src/render.js` — `drawPlatformShape` honors `p.ghost` (skeletal outline),
  `p.shakeMag` (crumble tremor), `p.accent` (stroke color); entities get an
  optional `drawTop(ctx)` pass after fighters (needed for Mist Pier fog).
- `src/ai.js` — in `makePlan`: standing inside an active `hazardZones` entry →
  jump/move out. One rule, all stages.
- UI: `index.html` settings button + `ui.js` wiring + `TEXT.settings` string.
- Docs: game-mechanics §6 rewritten; asset-requests round **9D** added.

## Per-stage gimmicks (from the ideas doc)

| # | Stage | Gimmick | Status |
|---|---|---|---|
| 1 | trainingBridge | none — baseline; cosmetic falling leaves | ☐ |
| 2 | quietHall | silence bell: every ~25s, 4s all-specials seal | ☐ |
| 3 | floodedGate | surge wave sweeps main platform, pushes (no dmg) | ☐ |
| 4 | shibuyaNight | curtain: 8s window, meter builds much faster | ☐ |
| 5 | curseMaw | fangs snap up at both main-platform edges (7%) | ☐ |
| 6 | gardenSteps | terraced layout + blooming flower heals 8% | ☐ |
| 7 | lanternCorridor | falling lantern → burn patch ~2.5s | ☐ |
| 8 | sunkenCrossing | slick surface (frictionPow ≈ 0.35) | ☐ |
| 9 | neonSplit | center energy wall 5s, 6% to cross | ☐ |
| 10 | boneSanctum | side/top platforms rattle → phase intangible | ☐ |
| 11 | bridgeDuel | whole main platform drifts ±70px (8s period) | ☐ |
| 12 | academyHall | bell: platforms glide between preset layouts | ☐ |
| 13 | mistPier | fog bank hides fighters as silhouettes 6s | ☐ |
| 14 | crosswalkRush | telegraphed traffic streaks at ground level (5%) | ☐ |
| 15 | cursedTeeth | falling fangs (shadow telegraph) + inhale suction | ☐ |
| 16 | riverGate | alternating crosswind drifts airborne fighters | ☐ |
| 17 | schoolWing | weak curse blob: pop for +8 meter, or 4% touch | ☐ |
| 18 | emptyCity | top platform crumbles under weight, reforms 5s | ☐ |
| 19 | billboardRoof | lightning strikes top platform after flashes (8%) | ☐ |
| 20 | domainCore | gravity 0.88× + orbiting side platforms | ☐ |

## Task checklist

- [x] Merge ideas doc to main; write this plan; merge plan to main
- [ ] Framework: stage_fx.js scaffold, initStageFx, stageMods, hazardZones,
      toggle in state.js, fighter.js gravity/friction/ghost, render.js hooks
- [ ] Settings toggle "Active Boards" (index.html + ui.js + config_menus.js)
- [ ] Stages 1–10 gimmicks
- [ ] Stages 11–20 gimmicks (incl. gardenSteps layout edit in stages.js)
- [ ] AI hazard-zone reaction
- [ ] Asset requests round 9D + optional loads in assets.js with fallbacks
- [ ] Docs: game-mechanics.md §6 update; tick the table above
- [ ] Playtest via `node tools/check_imports.mjs` (no browser here) + manual
      code review of each gimmick's math; then commit, push, **merge to main**

## Guardrails (from the ideas doc — enforce in code review)

Hazard damage 4–8%, fixed light knockback angled inward/upward, never a spike,
≥1s telegraph, one gimmick per stage, main-platform ledges always work, KO
impossible from a hazard alone.
