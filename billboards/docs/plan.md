# The billboard rendering system — implementation plan

How the 2.5D path gets built: posed 3D models rendered offscreen and blitted
into the unchanged 2D game. The stub in `billboards/src/billboard.js` is the
skeleton this plan fleshes out; the asset side is
[asset-requests.md](asset-requests.md), which this file is the engineering
companion to.

The one-paragraph design is in [../README.md](../README.md) and is not repeated
here. This file is about **order of work, the decisions already made, and the
contracts each phase has to honour** — written against the sprite system as it
actually exists, because that system already solved most of these problems once
and the answers transfer.

---

## The decisions

These were the open questions; each is now a position, with the reasoning
inline so it can be re-argued if the ground shifts.

### 1. Gameplay stays sprite-derived — full parity between backends

`bodyWidth` (src/silhouette.js) and `headHeightTarget` (src/heights.js) keep
being measured from the sprite silhouettes baked into the manifest, **for every
fighter, on every backend**. Models do not answer them.

The earlier note in the stub said a model "must answer them from its own
bounds". Following that through breaks something more important than accuracy:
a matchup that plays differently under `?render=billboard` than under
`?render=sprite` is two games wearing one roster, and every hitbox audit,
stage-reach audit and placement pass in `tools/` would need running twice.
Instead the *delivery* bears the burden: a model must match its fighter's
sprite silhouette closely enough that the sprite-derived numbers stay honest
(the billboard workbench overlays the two — see phase B3). Revisit only if a
fighter ever ships with no sprite set at all.

The same chain that sizes sprites sizes models: `heightCm → heightRatio →
headHeightTarget`. Models are delivered at real-world height in metres, which
makes them *better* inputs to that chain than sprites ever were — no pixel
measuring, no `headHeights` workbench override needed.

### 2. Three.js, vendored

Skinned glTF loading, an animation mixer, and retargeting are months of work to
hand-roll and one import to vendor. The repo has no build step and no runtime
npm, so `three.module.js` + `GLTFLoader` go into `/vendor/three/` as plain
ES modules (MIT license, noted in a VENDOR.md beside them — the copy was
hoisted out of `billboards/vendor/` when the `render3d/` backend arrived, so
both model backends share one version). Nothing outside the model backends may
import them: the game's only door into this system is
`src/render_backend.js`, and three.js must never load at all unless a model
backend is selected — dynamic `import()` inside `billboards/src/`,
paid only by players who opted in.

### 3. Billboard-per-fighter, not a 3D scene

One shared offscreen WebGL canvas renders one posed fighter at a time to a
texture; the texture is blitted into the 2D world by the same placement
arithmetic `sprites/src/sprites.js` uses. Camera is fixed and orthographic,
yawed to the ¾-right view the sprite art is drawn in, so a model and a sprite
read as the same fighter from the same seat. Facing is a blit-time mirror,
exactly as it is for sprites — which means asymmetric costumes flip, exactly as
they do today. Accepted, because it is the same acceptance the sprites made.

### 4. The engine's procedural motion stays procedural

`motion.js` layers sway, bob, squash & stretch, tumble spin and dodge rotation
on top of whatever the pose is — via `opts.rotation/scaleX/scaleY`, applied at
blit time to the texture. So clips must NOT bake these in: `dodge_roll` is a
held tuck that the engine spins, `idle` breathes only subtly because the engine
bobs it, `land` does not squash because `LAND_SQUASH_TIME` already does. This
is the single most likely thing for a clip author to get wrong, so it is a
delivery criterion in the asset request, not just a note here.

### 5. Timing belongs to the game clock

Combat timing is tuned so the sprite's strike frame appears the instant the
hitbox goes live (see the fps notes on `SEMANTIC_ANIMS` in src/characters.js).
Clips inherit the same contract: each attack clip's **contact beat** — full
extension — must land at the moment the sprite's strike frame would appear,
and the clip is driven by the same `animTime` the sprite path uses, never by
its own clock. The per-state timing table in the asset request encodes this;
the engine does not adapt to clips, clips are authored to the engine.

---

## The architecture, module by module

All under `billboards/src/`, all reached only through the backend entry:

```
billboard.js     the backend (exists, stubbed) — currentFrame / cyclePhase /
                 drawCharFrame, falling through to sprites per character
loader.js        fetch + parse .glb, register into MODELS, retarget shared
                 clips onto the rig; gated like config_transform.js gates
                 installs — enabled AND art present, never half-loaded
pose.js          animKey + animTime -> pose token; drives the AnimationMixer;
                 owns quantisation (30 Hz) so held poses hash equal
renderer.js      the shared offscreen WebGL canvas, ortho camera, toon
                 material; (model, pose token) -> texture, LRU-cached
blit.js          texture -> 2D context with the drawCharFrame opts contract:
                 foot line at (x, y), mirror by facing, rotate about the
                 hips-projected com, scaleX/Y about the foot line, alpha,
                 glow via ctx.shadow*, context restored — the same maths as
                 sprites.js, sharing constants where they can be shared
```

Contracts the stub already documents and every module above must keep:
`drawCharFrame` returns `false` on failure (render.js paints the placeholder);
the 2D context comes back exactly as it was found; pose tokens are opaque to
the game. One added by the trail: `fighter.js` stores tokens for afterimages
and redraws them up to `TRAIL_LEN × TRAIL_STEP` sim-ticks later, so the texture
cache must retain at least that window or a dashing fighter's trail goes blank.

Performance rests on one observation: **most states are holds.** Of the 26
animation states, sprites render 17 of them as a single held frame, and clips
for those settle into a hold too. With 30 Hz quantisation a fighter's texture
re-renders only when the pose token changes — an idle fighter costs roughly two
renders a second, and a four-player match stays far under one render per
display frame. The LRU is sized in textures (not bytes) with the trail window
as its floor.

---

## Phases

Named to match the asset rounds (B1, B2…) in asset-requests.md, but the first
phase needs no art at all — that is the point of it.

### Phase B0 — prove the pipe with a mannequin *(no deliveries)* — **DONE**

Vendor three.js. Build loader/pose/renderer/blit. Then, instead of waiting for
art, construct a **procedural mannequin** — a code-built skinned capsule figure
on the standard skeleton, with trivial generated clips — and register it for
one character key behind `?render=billboard&mannequin=<char>`.

This is the repo's own pattern (every effect and summon has a procedural
fallback so art never blocks engineering) applied to the whole pipeline: by the
end of B0, `smoke_combat.mjs` runs a full match where one fighter is a grey
mannequin and everything — trail, ledge hang, squash, glow, domain overlays,
missing-art fallback — is exercised and smoked *before the first model is
commissioned*. Every integration bug found here is a bug no delivery has to
wait on.

Exit criteria: combat smoke green with a mannequin in the match; pixel-probe
smoke confirming the mannequin actually drew (non-empty bbox where the fighter
stands); a context-state smoke (transform/alpha/composite identical before and
after `drawCharFrame`); pose-cache hit rate logged and >90% in an idle match.

### Phase B1 — the pilot fighter, end to end

**Yuji**: average build (173 cm), no weapon, no domain, the standard humanoid
skeleton with nothing bespoke — the cheapest possible full pass through
delivery → intake → approval → play. His clip set doubles as the seed of the
shared library (B2), so nothing authored for him is throwaway.

Alongside the model lands the **billboard workbench** (`billboards/workbench/`,
served like the sprite one): pick a character and a state, see the model posed
at a scrubbable `animTime` with the fighter's *sprite for that state ghosted
behind it at matched scale* — the sprite set used directly as the rigging
reference, which is what makes "inspiration" checkable rather than
aspirational. Per-clip approval mirrors the sprite intake flow: a delivery is
in the repo before it is in the game, and `MODELS` only registers a character
whose clips are all approved — the same all-or-nothing shape as
`TRANSFORM_POSES`' readiness check, and for the same reason: a half-approved
set pops holes mid-fight.

Exit criteria: Yuji plays as a model in `?render=billboard` against 26 sprite
fighters; toggling backends mid-comparison shows the same silhouette, size and
attack beats; all smokes green on both backends.

### Phase B2 — the shared clip library and retargeting

The economics that make this project feasible: sprites needed every pose drawn
per fighter (~36 × 27), but rigged clips **retarget**. The 14 locomotion and
defense states (idle, run, dash, jump, fall, land, hurt, crouch, shield, ledge,
dodge_roll, dodge_air, dizzy, prone) are authored once on the standard skeleton
and retargeted at load; the six normals (light, airLight, sideHeavy, upHeavy,
downHeavy, crouchAttack) come from a small set of **archetype** libraries
(unarmed, blade, polearm, hammer, bulk, caster — assignments in the asset
request); only the six identity states (charge, three specials, ult, victory)
are bespoke per fighter. Roughly 250 clips roster-wide instead of a thousand
drawings.

Retargeting lives in `loader.js` and is validated per fighter in the workbench,
because retargeted feet slide and retargeted hands clip through bulk — the
review step exists to catch exactly that, with the per-fighter override
mechanism being simply "a bespoke clip of the same name in the fighter's .glb
wins over the library", mirroring how `CHARACTERS[key].anims` overrides
`SEMANTIC_ANIMS`.

### Phase B3 — roster scale-out

Rigs land per fighter (rounds B3/B4 in the asset request: standard humanoids
first, bespoke bodies — Hanami, Dagon, Kurourushi, Mahoraga, Panda,
Mechamaru — after), each shipping individually the moment its clips clear
approval, exactly how sprite fighters shipped ahead of their effects. The
fallthrough makes partial rollout the normal state, not a degraded one.

Mahoraga is on the list because he is animated as a character
(`config_transform.js`); his model gates Megumi's install looking right in
billboard mode, but until it lands the install falls through to Mahoraga's
sprites like everyone else. `hanami_alt` WAS to be a material variant on Hanami's rig
rather than a second rig — the model equivalent of the manifest's `alternates`
block — but both are gone: his tree design was retired when round 17A redrew
him to canon, and the sprite-side `alternates` block went with it. The variant
mechanism stands; it has no subject.

### Phase B4 — look development

Last deliberately: it needs real models to art-direct against. Toon shading
and an outline pass so models sit beside anime-style 2D art instead of
clashing with it; the stage `tint` and domain grading applied to the model
render so a fighter is lit by the room they are in; glow routed through the
existing `ctx.shadow*` blit path first, upgraded to a shader rim only if that
reads poorly; DPR-aware texture resolution with a half-res fallback. Each item
lands behind the workbench's eye, none of them block a fighter shipping.

---

## Testing, throughout

The suite already runs on both backends by URL (`smoke_combat.mjs` took
`?render=billboard` unchanged); that stays the pattern. Added along the way:
the B0 pixel-probe and context-state smokes, `smoke_render_backend.mjs` cases
pinning that a modelled character draws as a model and an unmodelled one still
draws as a sprite, and a manifest-style resolution check that every registered
model's clip list covers all 26 states — the billboard sibling of
`check_pointing.mjs`. CI-shaped: all of it runs headless against `server.mjs`.

## What could sink this, named now

- **Retarget quality on extreme proportions.** Momo is 150 cm, Hanami 220; a
  library clip that reads on both is not guaranteed. Mitigation: archetype
  libraries + per-fighter overrides, and the workbench ghost comparison as the
  gate. Budget for overrides in the bespoke rounds rather than discovering the
  need mid-roster.
- **Style clash.** A lit 3D model next to painted sprites can look pasted-on.
  Mitigation: toon pass in B4, and the pilot exists partly to answer this
  early — if Yuji-as-model cannot sit convincingly beside 26 sprites, better
  to learn it after one rig than after twenty-eight.
- **Clip volume drift.** 250 clips is the *disciplined* number; it grows if
  archetype normals get per-fighter "just this one" exceptions. The request
  file's counts are the budget; exceptions go through it, not around it.
