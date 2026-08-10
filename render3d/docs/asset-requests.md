# 3D Asset Requests — open requests (the D-rounds)

Everything the `?render=3d` backend needs generated: **rigged, toon-ready 3D
models and animation clips**. This file is the render3d sibling of
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
and follows the same rules: everything here is **outstanding**, delivered
rounds move to a history file when the first one lands, and round numbers
(D1, D2…) are permanent so commits citing them keep resolving.

**Current status: nothing delivered — the pipeline is built and waiting**
(phase D0: live playback, on-twos sampling, toon ramp, ink outlines, foot IK,
turnaround, stage lighting, intake, workbench review and inheritance all run
today against the mannequin — `?render=3d&mannequin=all`; see
[plan.md](plan.md)). **D1 is the round to draw against.**

The 2D image inputs this track needs (Tripo seeding boards, face sheets,
shade-palette swatches, eye/mouth textures) are requested separately in
[image-requests.md](image-requests.md) — deliver those to the 2D intake, not
here.

---

## One asset truth, two backends

**The billboard delivery spec applies VERBATIM.** Read
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
first — units (metres, real height from its roster table), orientation (Y-up,
facing +Z, origin between the feet), T-pose bind, the standard Mixamo-named
skeleton, `Prop_*` prop bones, `Chain_<name>_<i>` physics chains, mesh budget
(≤30k tris standard / ≤60k bulk, ≤4 influences), baseColor-only ≤2048px, the
26 named clips with their durations and contact beats, aim-neutral strikes,
no baked engine motion, and the three sharing tiers (library / archetype /
identity). One commissioned rig serves both backends; **any rig already
approved for billboards is a valid intake candidate here** — drop it in
`render3d/intake/` and run the flow below.

### The D-spec additions (this backend only)

A delivery that also wants to look its best under the anime pass adds, in
the same `.glb`:

1. **Shade-bias (ILM) map** — grayscale, one value per baseColor texel,
   **packed as the baseColor texture's alpha channel** (glTF material extras:
   `"shadeBias": "baseColorAlpha"`). 0.5 is neutral; darker forces the texel
   into shade early (underside of the jaw, hair clumps, cloth folds); lighter
   holds the lit side late (the face plane). A rig without one renders with
   the neutral bias — legal, but the face will read "shader", not "drawn".
2. **Outline width channel** — vertex color, channel **R**, 0–1, default 0.5.
   0.5 = nominal line, 1.0 = double (jaw, silhouette), near 0 = hairline or
   none. A mesh (or material) can opt out entirely with extras
   `"outline": false` (eye whites, effect cards).
3. **Edited normals, baked in.** Face normals transferred from a smoothed
   proxy so the terminator sweeps the face as ONE clean arc; hair normals
   combed along clump direction. **This is a review gate**: the workbench's
   sweeping-light check fails a face whose terminator breaks into triangles,
   no matter how good the body is.
4. **Shadow palette** — per-material shade tint in glTF extras:
   `"toon": { "shadeTint": [r, g, b] }` (0–1 floats). Cool-shifted per the
   sprite art's own shading. Omitted = the global cool shift in
   `render3d/src/toon.js`. Any other TOON knob (`shadeThreshold`,
   `rimStrength`, `rimColor`, …) may be pinned the same way.
5. **Mouth/eye variants** *(optional — fighters ship without them)* — texture
   swap regions listed in extras, keyed to states (idle, hurt, ult, win).
   Spec'd fully when the first fighter needs them; do not block on this.

What separates a good model, in order of importance — silhouette equals
sprite silhouette (the ghost overlay is the gate), big flat shapes (toon
shading punishes surface noise), color from the canon reference with **no
baked lighting or gradients** (the ramp supplies all shading), **face
first** — is argued in [plan.md §5](plan.md).

### Clip authoring for LIVE playback

Everything in the billboard clip contract, plus (see [plan.md §6](plan.md)):
author **pose-to-pose** like limited animation (strong keys held, fast
breakdowns — on-twos sampling flattens inbetweens, so spend keys on poses);
put the **anticipation inside the startup** and snap to extension exactly at
the beat; **follow through after the beat** into a hold; do NOT bake foot
planting fixes (the engine runs foot IK) or breathing (the engine adds a
shoulder-only breath layer on holds). Optional per clip: **smear frames** —
stretched duplicate geometry at the 1–2 samples before the beat on heavies
and specials, standard anime practice, flagged in the clip's extras.

---

## Where to deliver

**Upload to `render3d/intake/`, never to `render3d/assets/`.** The flow is
[../intake/README.md](../intake/README.md):

```
render3d/intake/<char>/<char>.glb          the fighter: rig, mesh, materials,
                                           and their bespoke clips, embedded
render3d/intake/_shared/library.glb        the shared locomotion/defense clips
render3d/intake/_shared/<archetype>.glb    one normals set per archetype
```

Validate / import / approve with the shared model-intake tool (one validator
for both backends, extended, not forked):

```
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
# review in /render3d/workbench/?char=<char>, export the payload, then:
node tools/billboard_intake.mjs apply payload.json --backend 3d
```

Approval is **all-or-nothing per fighter**, decided in the render3d workbench
(sweeping-light face check first, then every clip against its sprite ghost,
at the beat, under the aim crosshair, facing both ways).

---

## The rounds

The roster table (who, at what height, which archetype, which props/chains)
is the billboard file's — one table, not two.

### Round D1 — the pilot: Yuji, complete *(open — draw against this)*

One toon-ready rig and all 26 clips, end to end, before anything else is
commissioned. **If billboard round B1 has delivered Yuji, D1 is that rig plus
the D-spec additions** (shade-bias alpha, outline vertex colors, edited
normals, shade tints); if not, D1 commissions him once and both backends are
served. His 14 locomotion/defense clips seed the shared library, his six
normals seed the unarmed archetype, six identity clips are his alone.

The style call — "does an anime-shaded, live-animated Yuji sit beside 26
sprite fighters without clashing?" — is answered here, on one rig, before the
roster spends anything.

**Deliverable: 1 rig (+ D-spec), 26 clips, to `render3d/intake/yuji/yuji.glb`.**

### Round D2 — the shared library and the archetype sets

Opens when D1's library seeds survive live retargeting review (the workbench
validates onto the extreme proportions: Momo at 150 cm, Hanami at 220).
The 14 shared clips finalized + the five remaining archetype normal sets
(blade, heavy, polearm, caster, bulk — six clips each), authored pose-to-pose
per the live-playback rules above.

**Deliverable: 14 library clips finalized + 30 archetype clips.**

### Round D3 — the standard humanoid rigs

Twenty-two toon-ready rigs (every standard-skeleton fighter except Yuji), in
review-sized batches of four to six, each shipping individually the moment
their set clears approval — per-character fallthrough carries the rest of the
roster on sprites throughout.

**Deliverable: 22 rigs (+ D-spec each) + 132 identity clips.**

### Round D4 — the bespoke bodies

Panda, Hanami (+ the `hanami_alt` material variant), Dagon, Kurourushi,
Mahoraga — same order and same override allowance as billboard round B4.

**Deliverable: 5 rigs, 1 material variant, 30 identity clips, ~20 bulk-normal
overrides.**

### Round D5 — spectacle *(opens after D3's first batch)*

The plan's §7/§8-D4 extras that need authored content: smear frames on the
archetype heavies, foreshortened identity moments (ult wind-ups toward the
lens, win-pose orbits — flagged per clip in extras so spectacle never blurs a
hitbox), and state-keyed material variants (Yuji's Sukuna markings during
ult, Yuta's full-meter glow).

### Round D6 — reserved: workbench catches

Every art round has produced a catch round; D6 is this track's, held open so
findings from D1–D5 have a number that is not a new fighter's round.

---

## The budget, in one place

| | Rigs | Clips |
|---|---|---|
| D1 — pilot | 1 (or B1's + D-spec) | 26 (shared with B1) |
| D2 — library + archetypes | — | 44 (shared with B2) |
| D3 — standard roster | 22 | 132 (shared with B3) |
| D4 — bespoke bodies | 5 (+1 variant) | ~50 (shared with B4) |
| D5 — spectacle | — | ~20 smears/variants |
| **Total NEW cost if B-rounds deliver** | **D-spec passes only** | **~20** |

The headline: because the two backends read the same rigs and the same clips,
the D-rounds' marginal cost over the B-rounds is the D-spec additions (a
texture-channel pass and a normals pass per rig) plus D5 — not a second
roster. If the B-rounds never run, the D-rounds ARE the commissioning rounds
and the B-numbers retire.
