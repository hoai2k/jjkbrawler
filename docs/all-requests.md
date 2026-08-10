# All Requests — the index

Every open asset request in the repo, in the order to commission them, with
what each one depends on and what *kind* of thing it asks for.

**This file links; it does not duplicate.** Each request document below owns
its own briefs, prompts, delivery specs and status — this page exists so that
"what is outstanding, and what should I ask for first?" has a one-screen
answer instead of six documents to cross-read. If a detail here disagrees with
the document it links to, **the linked document wins** and this page is stale.

Nothing outstanding blocks play. The game is complete and playable on the
sprite path with 27 fighters; everything below either extends it (the 3D
tracks) or fills a gap that currently degrades to silence or to a fallback.

**All three render modes are covered here.** The sprite path is fed by the 2D
art rounds (row 4); the billboard and render3d paths are fed by **one shared
commission** (rows 5–11) because both read the same rigs and clips. Neither
model path is blocked on code — both run today against the mannequin, which
is what `?render=billboard` and `?render=3d` now show by default for any
fighter without a delivered rig.

---

## The whole picture

| # | Request | Type | Status | Blocked by |
|---|---|---|---|---|
| 1 | [Audio — Round 10A: domain call-outs](audio-requests.md#10a--ryōiki-tenkai-per-domain-owner-voice--8-files) | 🎙️ **Voice** (Japanese) | open | — |
| 2 | [Audio — Round 10B: barrier & room](audio-requests.md#10b--the-barrier-and-the-room-sound-effects--4-files) | 🔊 **Sound effects** | open | — |
| 3 | [Audio — the shipped fighters' element layers](audio-requests.md#owed-by-the-staged-fighters) | 🔊 **Sound effects** | open, live gap | — |
| 4 | [2D art — Round 18](asset-requests.md) | 🖼️ **Images** (sprites) | open | — |
| 4b | [2D art — 18E: twenty backdrops repainted for the 3D camera](asset-requests.md#18e-twenty-backgrounds-repainted-for-the-3d-camera--20-images) | 🖼️ **Images** (backdrops) | open | — |
| 4c | [2D art — 18F: near-field cards for the garnish layer](asset-requests.md#18f-near-field-cards-for-the-garnish-layer--14-images-optional) | 🖼️ **Images** (keyed cards) | open, optional | — |
| 5 | [3D images — DI1: turnaround boards](../render3d/docs/image-requests.md#round-di1--model-generation-turnaround-boards-the-tripo-inputs) | 🖼️ **Images** (reference) | open | — |
| 6 | [3D images — DI2/DI3: face sheets, shade palettes](../render3d/docs/image-requests.md#round-di2--face-sheets-the-face-first-gates-reference) | 🖼️ **Images** (reference) | open | DI1 (same fighter) |
| 7 | [3D models — B1/D1: the Yuji pilot](../render3d/docs/asset-requests.md#round-d1--the-pilot-yuji-complete-open--draw-against-this) | 🧊 **3D model + clips** | open | DI1–DI3 for Yuji |
| 8 | [3D models — D2: library + archetypes](../render3d/docs/asset-requests.md#round-d2--the-shared-library-and-the-archetype-sets) | 🧊 **Animation clips** | open | D1 review |
| 9 | [3D models — D3: the standard roster](../render3d/docs/asset-requests.md#round-d3--the-standard-humanoid-rigs) | 🧊 **3D models + clips** | open | D2 |
| 10 | [3D models — D4: bespoke bodies](../render3d/docs/asset-requests.md#round-d4--the-bespoke-bodies) | 🧊 **3D models + clips** | open | D3 |
| 11 | [3D models — D5: spectacle](../render3d/docs/asset-requests.md#round-d5--spectacle-opens-after-d3s-first-batch) | 🧊 **Animation clips** | open | D3 first batch |
| — | [3D images — DI4: shared face textures](../render3d/docs/image-requests.md#round-di4--shared-face-textures-one-time-roster-wide) | 🖼️ **Images** (texture) | open, optional | — |
| — | [Music](music-requests.md) | 🎵 **Music** | **all 20 delivered** | — |
| — | [Audio Rounds 1–9](audio-requests-history.md) | 🔊 Sound effects | **delivered** | — |
| — | [2D art Rounds 1–17](asset-requests-history.md) | 🖼️ Images | **delivered** | — |

---

## Unfinished engineering — plans you may or may not want continued

Not asset requests: these are **implementation** plans with work still in
them. They need no delivery to progress, only a decision to carry on. Listed
so that "what is half-built?" is answerable from the same page.

| Plan | State | What is left |
|---|---|---|
| [2.5D camera (`?camera=3d`)](2.5d-camera-plan.md) | feature-complete, polish open | Garnish cards for 15 of 20 boards; a Settings toggle; **model-textured billboards** (see below). Its art asks are commissioned as 18E/18F (rows 4b–4c) |
| [render3d (`?render=3d`)](../render3d/docs/plan.md) | D0–D2 built, D3+ need art | Engine side is done and dialled. D3–D5 are asset rounds (7–11 above), not code |
| [billboards (`?render=billboard`)](../billboards/docs/plan.md) | B0 built, B1+ need art | Same shape: the pipeline runs on the mannequin; everything further is the shared commission |
| [Effects plan](effects-plan.md) | reference doc | Element-aware attack feedback; check `src/config_fx.js` against it before treating anything here as open |
| [Stage variety](stage-variety-plan.md) | **complete** (15/15 checked) | Nothing — kept for the decisions record and [its ideas doc](stage-variety-ideas.md) |

### The one cross-cutting gap: the render modes and the camera do not fully compose

`?render=` (how a character is drawn) and `?camera=` (the lens they exist in)
are orthogonal flags and can both be set. But **`?camera=3d` always draws
sprites**, whichever render backend is chosen: it textures quads out of
`frameImage()`, and the model backends hand out opaque pose tokens only their
own `drawCharFrame` can rasterise.

Until recently that combination drew **no fighter at all** — the token reached
`frameImage`, resolved nothing, and the quad was skipped. That is fixed (the
camera resolves poses through the sprite path, so the composition always draws
something), but the interesting version — the anime-shaded model standing
inside the perspective camera — is still unbuilt and is the last item in the
camera plan's "still open" list. It needs no art.

**What each combination shows today:**

| | `?render=sprite` | `?render=billboard` | `?render=3d` |
|---|---|---|---|
| *(no camera flag)* | sprites | posed models / mannequins | live anime models / mannequins |
| `?camera=3d` | sprites in 3D space | sprites in 3D space | sprites in 3D space |

---

## The order, and why

### First: the audio gaps (1–3) — small, unblocked, and currently silent

Independent of everything else and the cheapest wins in the list. Rounds 10A
and 10B are already wired: every key is registered and called, and an
undelivered sound is dropped silently, so delivery is "drop the mp3s in
`assets/sfx/`" with no code change.

**10A is the only 🎙️ voice request in the repo** and the only one that cannot
be produced by `tools/generate_sfx.py` — that tool drives a sound-*effects*
endpoint and does not speak. It needs a Japanese-speaking VA or a hand-driven
TTS pass. Everything else in the audio column goes through the generator.

Item 3 is the tail of a round that shipped: four sounds written down while
their fighters were staged, all four now on the select screen, all four still
missing. Dagon's domain sting is folded into 10B; the three element layers
still need prompts written.

### Then: 2D art Round 18 (4) — the sprite path's own queue

Unrelated to the 3D tracks and on its own clock. Listed here for completeness:
it is the only open request that touches what most players currently see.

**Rows 4b and 4c now have a home.** §10 of the camera plan measured which art
changes the 2.5D camera would actually reward, and that finding is now written
as two request blocks in the 2D art file.

**18E** repaints the twenty stage backdrops at **3200×1800**. The backdrop
plane over-fills the frustum, so only ~49% of a painting's linear extent is
ever on screen — a 1600×900 board upscales 1.62× (3.24× at DPR 2) where flat
mode shows it at a slight downscale. The rule that falls out is a neat one:
paint 3200×1800 and make the **centre 1600×900** a finished picture on its
own, because that centre box is what the 3D camera crops to while flat mode
shows the whole frame. `flooded_gate.jpg` (800×437), `shibuya_night.webp`
(1200×675) and `curse_maw.jpg` (wrong aspect) go first.

**18F** is the more interesting half and is optional: fourteen keyed near-field
cards for the garnish layer. Splitting a *backdrop* into parallax layers buys
2.3 px of shift because this camera barely translates; a card at `z = +2` buys
14 px at the same yaw and 64 px in a drama shot. Proximity to the lens is the
whole term — which is why 18E asks for bigger paintings rather than split ones,
and why the measurement **withdrew** the parallax-layer idea entirely. All
fourteen have procedural stand-ins today, so any subset lands usefully.

### Then: the 3D tracks (5–11) — strictly ordered, and image-first

The dependency that is easy to miss: **the image rounds feed the model
rounds.** A modeller — human or image-to-3D — cannot work from the sprite set,
because sprites only ever show one ¾ view and mirror the rest. So:

```
DI1 turnaround board ─┐
DI2 face sheet        ├─▶ D1 Yuji rig + 26 clips ─▶ D2 library + archetypes
DI3 shade palette    ─┘         (the style call)          │
                                                          ▼
                                        D3 roster ─▶ D4 bespoke ─▶ D5 spectacle
```

Commission DI1–DI3 **for Yuji only** first. D1 exists to answer one question —
*does an anime-shaded, live-animated fighter sit beside 26 sprite fighters
without clashing?* — on one rig, before the roster spends anything. Ordering
the whole roster's boards before that question is answered is the expensive
mistake this sequence exists to prevent.

### The B-rounds and the D-rounds are the same commission

[`billboards/docs/asset-requests.md`](../billboards/docs/asset-requests.md)
(rounds B1–B5) and
[`render3d/docs/asset-requests.md`](../render3d/docs/asset-requests.md)
(rounds D1–D6) request **the same rigs and the same clips**. Both backends
read one delivery spec, one skeleton and one 26-state clip contract; a rig
approved for one is a valid intake candidate for the other the same day.

The D-rounds add a **finishing pass**, not a second roster: a shade-bias map
packed in the baseColor alpha, an outline width channel in vertex colours,
edited normals, per-material shade tints. If you are commissioning fresh,
**ask for the D-spec in the same round** — it is far cheaper than a second
pass later. The D-round tables carry the full delta.

So the practical reading of rows 7–11: they are one commission that satisfies
both 3D backends, and the B-numbers exist because the billboard path was
specified first.

---

## Asset types, and where each one goes

| Type | Deliver to | Processed by | Reviewed in |
|---|---|---|---|
| 🖼️ Images — sprites, cards, effects, backdrops | `assets/intake/` | `tools/intake.py` | `/sprites/workbench/` |
| 🖼️ Images — 3D reference boards, face sheets, palettes | `assets/intake/render3d/` | by hand (briefs, not runtime art) | — |
| 🧊 3D models + clips (`.glb`) | `billboards/intake/` or `render3d/intake/` | `tools/billboard_intake.mjs [--backend 3d]`, `tools/blender_conform.py` | `/billboards/workbench/`, `/render3d/workbench/` |
| 🔊 Sound effects | `assets/intake/sfx/` → `assets/sfx/` | `tools/generate_sfx.py` | in play |
| 🎙️ Voice | `assets/intake/sfx/` → `assets/sfx/` | **not** `generate_sfx.py` — VA or TTS | in play |
| 🎵 Music | `assets/music/boards/` | — | in play |

Two rules hold across every type: **deliveries land in an intake directory,
never in the runtime directory**, and **approval is a separate step from
import** — art is in the repo before it is in the game, and what players see is
what somebody reviewed.

---

## Keeping this page honest

This index goes stale the moment a round lands and nobody edits it. The
guardrail is that it holds **no facts of its own** — every status here is
restating a status line in a linked document, so the fix for a wrong row is
always "read the linked doc, correct the row", never "decide what is true".

When a round is delivered: move it to that track's history file (each track
has one), then flip its row here to **delivered** or delete it. When a round
is opened: add a row, and say what it is blocked by.
