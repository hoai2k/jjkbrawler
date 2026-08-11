# Billboard Asset Requests — open requests

**This file asks for MODELS and CLIPS. Every 2D image any render mode needs —
including the reference boards these rounds are generated from — is in
[docs/image-requests.md](../../docs/image-requests.md), the single
image-request document.**

Everything the 2.5D path needs generated: rigged 3D models and animation clips
for the whole roster. This file is the billboard sibling of
[docs/asset-requests.md](../../docs/asset-requests.md) and follows its rules:
everything here is **outstanding**, delivered rounds move to a history file
when the first one lands, and round numbers (B1, B2…) are permanent so commits
citing them keep resolving.

**Current status: B1 is DELIVERED — Yuji plays as a model on both backends.**
His rig was generated, conformed to spec and given all 26 clips
(`tools/blender_author_clips.py`), and he holds his own in a real match beside
26 sprite fighters. What B1 proved, and what it cost, is written up in
[b1-yuji.md](b1-yuji.md). **B2 is the round to draw against.** B3–B4
are written now so the total shape and budget of the project is a decision made
once, up front — not discovered one fighter at a time.

The engineering these deliveries plug into is
[plan.md](plan.md). Two of its decisions shape every request here:

- **Gameplay stays sprite-derived.** A model changes how a fighter *looks*,
  never how they *play* — so a model must match its fighter's sprite silhouette
  closely enough that the sprite-measured hurtboxes and reach stay honest. The
  billboard workbench overlays model and sprite; a model that reads visibly
  wider, taller or longer-reaching than its sprites fails review.
- **The sprite set is the storyboard.** Every clip has a named sprite (or
  sprite pair) as its pose reference, at `sprites/assets/<char>/<pose>.png`.
  The clip does not have to *be* the drawing — it has to be the same *read*:
  same stance, same silhouette at the beat that matters, same character. The
  standing rules for what each pose must be are
  [sprites/docs/pose-brief.md](../../sprites/docs/pose-brief.md); everything
  there about stance, extension and readability applies to the pose a clip
  holds.

Each fighter's canonical appearance reference is unchanged from the sprite
rounds: `assets/reference/canon/<char>_idle.png`, plus their character block in
the sprite request history. Model the fighter that image shows.

---

## Where to deliver

**Upload to `billboards/intake/`, never to `billboards/assets/`.** The flow —
validate, import, workbench review, apply — is [../intake/README.md](../intake/README.md);
it is deliberately separate from the sprite intake.

```
billboards/intake/<char>/<char>.glb        the fighter: rig, mesh, materials,
                                           and their bespoke clips, embedded
billboards/intake/_shared/library.glb      the shared locomotion/defense clips
billboards/intake/_shared/<archetype>.glb  one normals set per archetype
```

`billboards/assets/` holds **approved runtime art only**. A delivery sits in
intake until every clip clears review in the billboard workbench; a fighter
registers all-or-nothing (the same readiness rule as `TRANSFORM_POSES` in
src/config_transform.js, for the same reason — a half-approved set pops holes
mid-fight).

## Delivery spec — models

glTF 2.0 **binary** (`.glb`), one fighter per file.

- **Units & size:** metres, real-world scale. Model each fighter at the height
  listed in the roster table below — the game's own `heightCm → scale` chain
  (src/heights.js) does the rest, with no per-model tuning.
- **Orientation:** Y-up, facing **+Z**, origin on the floor midway between the
  feet. The engine mirrors for facing, exactly as it does sprites — asymmetric
  costumes flip, which is the same acceptance the sprite art already made.
- **Bind pose:** T-pose.
- **Skeleton:** the standard humanoid skeleton with Mixamo-style bone naming
  (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `Left/RightShoulder`,
  `…Arm`, `…ForeArm`, `…Hand`, `…UpLeg`, `…Leg`, `…Foot`, `…ToeBase`). Shared
  clips retarget onto this naming; a renamed bone is a fighter the library
  cannot animate. Extra bones (props, tentacles, the wheel) are additions on
  top, never renames.
- **Props are part of the rig.** Nobara's hammer, Maki's polearm, Momo's broom,
  Gakuganji's guitar: own bone(s), parented to the hand or back as the sprites
  show them. A separate prop file is a prop that drifts. Naming is fixed so
  clips and tools can find them: `Prop_Main` (the weapon hand), `Prop_Off`
  (off-hand), `Prop_Float` (rides near the body in nobody's hand — Mahoraga's
  wheel). The mannequin carries crude placeholders on the same bones
  (src/props.js), so archetype clips are authored against the weapon
  silhouette from day one.
- **Physics chains** — braids, tendrils, anything that should trail the body —
  are bone chains named `Chain_<name>_<i>` (i = 0 at the root: Mei Mei's braid
  is `Chain_braid_0…3` hanging from `Head`). The engine drives them with a
  deterministic sway; do NOT bake secondary motion into clips. Expected chains
  per fighter are in CHARACTER_CHAINS (src/props.js) and the roster table.
- **Strikes are aimed by the engine.** Attack states pitch toward a target —
  the nearest opponent, or the controller's aim point — across the spine, and
  two-bone IK then solves the striking limb onto it. Author every attack clip
  AIM-NEUTRAL: a straight, level strike. A clip that bakes its own up-or-down
  angle fights the system, and the workbench's crosshair will show it
  double-pitching.
- **A clip's EXTENSION is its own and is preserved.** The solver re-aims the
  limb without lengthening it: how far a strike reaches comes from the clip,
  only the direction tracks the target. So author the reach you want — a short
  jab and a full lunge stay distinct at every angle — and note that the elbow
  carriage is preserved too, since the solver keeps the bend plane the clip
  established. A hook and a straight punch remain different moves.
- **Mesh budget:** ≤30k triangles standard build, ≤60k for the bulk bodies.
  Skinning ≤4 influences per vertex.
- **Materials:** baseColor texture only, ≤2048px, no baked lighting, no
  emissive tricks — the engine applies its own toon pass so the model sits
  beside painted 2D art, and anything pre-lit fights it. Match the palette of
  the canonical reference, not of the anime screenshots.
- **`hanami_alt` is withdrawn, and is not to be delivered.** It was a second
  material set on Hanami's rig carrying his earlier bark-and-foliage tree
  design. That design is retired: round 17A redrew him to canon as the pale
  humanoid curse, the alternate sprite set it mirrored has been removed from
  the game, and the frames are archived at
  [`assets/reference/hanami_alt/`](../../assets/reference/hanami_alt/). Model
  the canon Hanami and nothing else. The variant MECHANISM is still the right
  one for a genuine second look — see the plan's costume/state variants — it
  just has no subject today.

## Delivery spec — clips

- **Named exactly** as the animation state keys in the table below. The engine
  resolves clips by these names (they are the keys of `SEMANTIC_ANIMS` in
  src/characters.js); a misnamed clip is a state that silently falls through
  to sprites.
- **Timed to the game clock.** Durations and contact beats in the table are
  the contract: combat is tuned so a strike shows at the instant its hitbox
  goes live, and the engine drives clips by the same `animTime` it drives
  sprites — it will not stretch a clip to fit.
- **No baked engine motion.** The engine layers breathing bob, run bob and
  sway, landing squash, tumble spin and dodge rotation procedurally on top of
  the pose (src/motion.js). A clip that bakes these doubles them: `dodge_roll`
  is a *held tuck* the engine spins, `land` does not crouch-bounce, `idle`
  breathes only in the shoulders. This has cost re-requests in spirit before
  (sprite rounds re-drew poses that fought the engine) — it is the most likely
  fault in a first delivery, so it is a review gate, not advice.
- **Loops loop.** First and last frame of a looping clip must match pose and
  velocity; a hitch at the seam on `run` shows three times a second.
- **`ledge` holds the gripping hand still.** The engine hangs the fighter from
  the hand-bone position (the model-side equivalent of the sprite `ledge`
  anchor), so a drifting hand is a fighter bobbing against the platform edge.

### The clip set — 26 states

Reference sprites are per fighter at `sprites/assets/<char>/…`. "Hold" means
the clip settles into its pose and stays; "beat" is when full extension must be
reached, matching when the move's hitbox goes live.

| Clip name | Kind | Timing | Reference sprite(s) | Notes |
|---|---|---|---|---|
| `idle` | loop | ~0.9s cycle | `idle_a`, `idle_b` | Subtle; engine adds bob/sway |
| `run` | loop | 0.31s cycle | `run_reach_a`, `run_pass_a`, `run_reach_b`, `run_pass_b` | Full stride both legs; sprint cadence |
| `dash` | hold | — | `dash` | Burst lean |
| `jump` | hold | — | `jump_rise` | Rising shape |
| `fall` | hold | — | `fall` | |
| `land` | one-shot | ≤0.15s | `land` | No squash — engine squashes |
| `hurt` | hold | — | `hurt` | |
| `crouch` | loop | 0.67s cycle | `crouch_a`, `crouch_b` | Must genuinely duck — see pose-brief |
| `crouchAttack` | one-shot | 0.18s, beat 0.09s | `crouch_attack_a/_b` | Low poke from the crouch |
| `shield` | hold | — | `guard` | |
| `ledge` | hold | — | `ledge_hang` | Grip hand still (see above) |
| `dodge_roll` | hold | — | `dodge_roll` | Held tuck; engine spins it |
| `dodge_air` | hold | — | `dodge_air` | |
| `light` | one-shot | 0.17s, beat 0.08s | `attack_light_a/_b` | Wind-up → strike |
| `airLight` | one-shot | 0.25s, beat 0.13s | `attack_air_a/_b` | |
| `sideHeavy` | one-shot | 0.33s, beat 0.17s | `attack_heavy_a/_b` | The committed swing |
| `upHeavy` | one-shot | beat 0.17s, then hold | `attack_up` | Anti-air extension |
| `downHeavy` | one-shot | beat 0.17s, then hold | `attack_down` | |
| `charge` | loop | ~0.5s cycle | `charge` | Energy-gathering stance |
| `specialNeutral` | one-shot | beat 0.13s, then hold | `special_neutral` | Identity — see kit |
| `specialSide` | one-shot | beat 0.13s, then hold | `special_side` | Identity |
| `specialDown` | one-shot | beat 0.13s, then hold | `special_down` | Identity |
| `ult` | loop | 0.29s cycle | `ult_a`, `ult_b` | Held while the ultimate runs |
| `dizzy` | loop | ~1s cycle | `dizzy` | Small wobble |
| `prone` | hold | — | `prone` | Knocked flat |
| `win` | hold or loop | — | `victory` | Round-end pose |

**Sharing tiers.** 14 states are the **shared library**, authored once and
retargeted (idle, run, dash, jump, fall, land, hurt, crouch, shield, ledge,
dodge_roll, dodge_air, dizzy, prone). Six normals come from the fighter's
**archetype** set (light, airLight, sideHeavy, upHeavy, downHeavy,
crouchAttack). Six are **identity** clips, bespoke per fighter (charge, the
three specials, ult, win) — what each special and ultimate *is* comes from the
kit: [docs/move-list.md](../../docs/move-list.md) names all of them and
[docs/characters.md](../../docs/characters.md) says why. A fighter may also
override any shared or archetype clip with a bespoke one of the same name in
their `.glb`; the bespoke clip always wins, the same way a character's `anims`
block overrides `SEMANTIC_ANIMS`.

---

## The roster — 28 rigs

Heights are `heightCm` from src/characters.js. Fighters with no published
height are modeled at **190 cm working height** — not a canon claim, but how
the game already sizes them (`HEIGHT_UNKNOWN_RATIO = 1.0` against the 190 cm
reference). Mahoraga is modeled to match his current in-game size, which the
billboard workbench verifies against his sprites.

| Key | Fighter | Model at | Rig | Archetype | Props / bespoke notes |
|---|---|---|---|---|---|
| `yuji` | Yuji Itadori | 173 cm | standard | unarmed | **B1 pilot** |
| `todo` | Aoi Todo | 190 cm | standard | unarmed | Grappler bulk in the shoulders |
| `yuki` | Yuki Tsukumo | 180 cm | standard | unarmed | |
| `uro` | Takako Uro | 190 cm* | standard | unarmed | Sky-palm effects are engine-side |
| `mahito` | Mahito | 179 cm | standard | unarmed | Patchwork skin in the texture |
| `sukuna` | Ryomen Sukuna | 173 cm | standard | unarmed | Facial/body markings; no shawl (round 2 ruling) |
| `choso` | Choso | 181 cm | standard | unarmed | Blood effects are engine-side |
| `hakari` | Kinji Hakari | 185 cm | standard | unarmed | Shutters are engine-side |
| `yuta` | Yuta Okkotsu | 175 cm | standard | blade | Katana, sheathed at idle |
| `nanami` | Kento Nanami | 184 cm | standard | blade | Wrapped blunt blade |
| `toji` | Toji Fushiguro | 187 cm | standard | blade | Spear + chain; inventory worm not modeled |
| `reggie` | Reggie Star | 190 cm* | standard | blade | Katana-umbrella |
| `nobara` | Nobara Kugisaki | 160 cm | standard | heavy | Hammer + nails in hand |
| `meimei` | Mei Mei | 190 cm* | standard | heavy | Braided axe; braid needs bones |
| `maki` | Maki Zen'in | 170 cm | standard | polearm | Playful Cloud |
| `momo` | Momo Nishimiya | 150 cm | standard | polearm | Broom — also ridden; see her kit |
| `gojo` | Satoru Gojo | 190 cm | standard | caster | Blindfold, not glasses (canon ref) |
| `megumi` | Megumi Fushiguro | 175 cm | standard | caster | Shadow/shikigami are engine + summons |
| `inumaki` | Toge Inumaki | 164 cm | standard | caster | High collar; seal marks on tongue unseen |
| `mechamaru` | Kokichi Muta | 205 cm | standard | caster | Puppet body; arm cannon |
| `gakuganji` | Yoshinobu Gakuganji | 190 cm* | standard | caster | Guitar, slung and played |
| `geto` | Suguru Geto | 191 cm | standard | caster | Curse summons are engine-side |
| `jogo` | Jogo | 180 cm | standard | caster | Volcano head is mesh, not particle |
| `panda` | Panda | 200 cm | standard, heavy build | bulk | Core marking per round 2 ruling |
| `hanami` | Hanami | 220 cm | standard + growths | bulk | Canon Hanami: lean pale body, black brushstroke stripes, antler horns, one shoulder wrapped in white cloth (round 17A). The tree design is retired — no `hanami_alt` variant |
| `dagon` | Dagon | 215 cm | standard + head tentacles | bulk | Extra bones for the tendrils |
| `kurourushi` | Kurourushi | 190 cm* | **bespoke** (insectoid) | bulk | The one nonstandard skeleton; bulk clips as reference only |
| `mahoraga` | Mahoraga | match in-game | standard + wheel | bulk | Megumi's install actor (config_transform.js) |

\* working height, see above.

---

## Round B1 — the pilot: Yuji, complete *(DELIVERED)*

One rig and all 26 clips, end to end, before anything else is commissioned.
Yuji is the cheapest full pass: average build, no weapon, nothing bespoke about
the skeleton — so every problem B1 surfaces is a *pipeline* problem, not a
Yuji problem, and gets fixed before it multiplies by 28.

Nothing in B1 is throwaway: his 14 locomotion/defense clips are authored as
the first draft of the shared library, his six normals as the first draft of
the unarmed archetype set, and only his six identity clips (Divergent Fist,
Manji Kick, Unbreakable Grit, Black Flash, charge, win) are his alone.

**Deliverable: 1 rig, 26 clips** (14 library-seed + 6 unarmed-seed + 6
identity), to `billboards/intake/yuji/yuji.glb`.

## Round B2 — the shared library and the archetype sets

Opens when B1's library seeds survive retargeting review. The 14 shared clips
are finalized on the standard skeleton, then the five remaining archetype
normal sets are authored (blade, heavy, polearm, caster, bulk — six clips
each). The workbench validates each set retargeted onto its most extreme
proportions (Momo at 150 cm, Hanami at 220) before the round closes.

**Deliverable: 14 library clips finalized + 30 archetype clips.**

## Round B3 — the standard humanoid rigs

Twenty-two rigs (every standard-skeleton fighter except Yuji), delivered in
batches small enough to review pose by pose — the sprite rounds settled on
batch sizes of four to six fighters and that cadence carries over. Each fighter
ships with their six identity clips; each registers into the game individually
the moment their set clears approval, playing alongside sprite fighters via
the per-character fallthrough.

**Deliverable: 22 rigs + 132 identity clips.**

## Round B4 — the bespoke bodies

The five whose bodies the standard skeleton cannot carry unmodified: Panda,
Hanami, Dagon, Kurourushi, Mahoraga. Expect the
bulk archetype normals to need per-fighter overrides here — that is budgeted,
not an overrun. Kurourushi is the only fully bespoke skeleton on the roster
and lands last, with his clips authored directly rather than retargeted.

**Deliverable: 5 rigs, 30 identity clips, override allowance for bulk normals
(~20 clips).** (It was 5 rigs *and a material variant* until the `hanami_alt`
tree design was retired.)

## Round B5 — reserved: workbench catches

Every sprite round produced a catch round — poses that failed once placed at
real size next to real opponents. The billboard workbench will produce the
same, and B5 is its number, held open in advance so findings from B1–B4 have
somewhere to go that is not a new fighter's round.

---

## The budget, in one place

| | Rigs | Clips |
|---|---|---|
| B1 — pilot | 1 | 26 |
| B2 — library + archetypes | — | 44 |
| B3 — standard roster | 22 | 132 |
| B4 — bespoke bodies | 5 (+1 variant) | ~50 |
| **Total** | **28** | **~250** |

Against the sprite path's ~36 drawings × 27 fighters (~1,000 delivered images,
before catch rounds), the rigged pipeline buys the roster back for roughly a
quarter of the asset count — that ratio is the argument for the shared library
discipline, and the reason exceptions to it go through this file rather than
around it.
