# `render3d/` — the live-3D anime character rendering path

Rigged 3D models animated at full frame rate, rendered in a hand-drawn anime
style — toon-ramped, ink-outlined, stepped on twos — and blitted into the
same 2D world the sprite path draws into. The billboard path's heir: same
delivery spec, same 26-state clip contract (imported from
`billboards/src/states.js`, never copied), same per-character fallthrough to
sprites. **Phase D0 and the D1/D2 engine side are built**: live playback,
the anime pass, foot IK, real turnarounds, aimed strikes, head look-at, hurt
flinch, micro-parallax and stage-derived lighting all run today, proven by
the mannequin and a generated test delivery. What it waits on now is art
(round D1 in [docs/asset-requests.md](docs/asset-requests.md)).

    node server.mjs
    open 'http://127.0.0.1:5174/?render=3d'               # the real thing
    open 'http://127.0.0.1:5174/?render=3d&mannequin=none' # sprites where no rig exists
    open 'http://127.0.0.1:5174/render3d/workbench/'      # look-dev + review

`?render=render3d`, `?render=model(s)` and `?render=anime` are aliases
(src/render_backend.js). The backend NAME is `3d`; the directory is
`render3d/` only to avoid a leading digit.

- **[docs/plan.md](docs/plan.md)** — the implementation plan: the anime
  look, the live layers, the cost model, phases, risks.

Strikes **aim and reach**: attack states pitch toward the target and the
striking limb is solved onto it by the shared two-bone IK
(`billboards/src/ik.js` — the same solver, the same clip contract). Facing here
is a real 180° yaw rather than a mirror, so the reach target is built in the
rig's own frame and pushed through `localToWorld`; that is what keeps a
left-facing fighter reaching the way they are actually facing.
- **[docs/asset-requests.md](docs/asset-requests.md)** — the D-rounds: every
  rig and clip, the D-spec additions over the billboard delivery spec
  (shade-bias map, outline vertex colors, edited normals, shade palettes).
- **[docs/image-requests.md](docs/image-requests.md)** — the 2D images this
  track needs: turnaround boards for image-to-3D seeding (Tripo et al.),
  face sheets, shade palette swatches, shared face textures.
- **[intake/README.md](intake/README.md)** — where deliveries land and how
  they get into the game (`tools/billboard_intake.mjs … --backend 3d`).

```
render3d/
  src/         the pipeline: backend.js (registry entry), loader.js (rig
               registry + clip inheritance), pose.js (on-twos sampling + the
               live layers, every dial), toon.js (ramp/shade/rim), outline.js
               (ink shells), scene.js (offscreen WebGL + pose cache + stage
               light rig), blit.js (into the 2D world; no mirror — turnaround)
  assets/      approved runtime rigs + manifest.json (the registry)
  intake/      deliveries land here; validate -> import -> review -> apply
  workbench/   /render3d/workbench/ — pose editor, look-dev dials,
               sweeping-light check, comparison sprite, aim crosshair,
               clip inheritance, approval
  docs/        plan, asset requests (D-rounds), image requests (DI-rounds)
```

## Posing by hand: the workbench pose editor

The clip library was authored blind — each state's default clip is a guess at
the read of the sprite it replaces — and "the arm is too low" is not a note
anyone can apply. **Edit pose** in `/render3d/workbench/` turns it into
keyframes.

It edits EXTREMES, not frames. A clip is a handful of poses with a timing and
a curve between them (`billboards/src/clips.js`), so the editor gives you the
extremes and nothing else: pick a key from the strip, pose the body, choose how
it travels out of that key (`ease`, `snap`, `back`, `hold`…), and the
in-betweens rebuild. Keys can be added at the playhead or at the contact beat,
and removed. Dragging a joint rotates its PARENT bone so the limb points at the
pointer; joints too small to hit are reachable from **Selected joint** with
per-axis sliders. The playhead snaps to the selected key, so what you drag is
what you change.

**Two spaces, and the panel always says which.** Some bones are not the clip's
to pose: in an attack `ik.js` solves the striking arm onto the aim point and
the spine pitches toward it, and a keyframe on those is overwritten a
millisecond later. Those bones are classified per state (`boneOwners` in
`src/pose.js`), drawn as diamonds rather than discs, and their edits are stored
as offsets applied AFTER the solve — which is also the truer note, since it
holds at every angle the strike can be thrown at rather than just the one on
screen. **Output changes** downloads `clip-edits.json`:

```json
{ "kind": "render3d-clip-edits",
  "characters": { "gojo": { "light": {
    "duration": 0.167, "beat": 0.083,
    "keys": [ { "t": 0, "ease": "in",   "pose": { "Spine": [2, -14, 0], … } },
              { "t": 0.037, "ease": "snap", "pose": { … } },
              { "t": 0.083, "ease": "out",  "pose": { … } } ],
    "targetSpaceOffsetsDeg": { "RightForeArm": [ { "t": 0.083, "deg": [0, 0, 18] } ] } } } } }
```

The `keys` drop straight into the `POSES`/`stateKeys` tables in
`billboards/src/mannequin.js`. `targetSpaceOffsetsDeg` deliberately does not:
those bones are solved at pose time, so the note belongs in the solver's
shares, not in a clip. Everything lives in the page only; nothing on disk moves
until the JSON is applied by hand.

## Size and facing, per delivery

Two facts about a MODEL that no clip can carry, both on the manifest entry and
both dialled in the workbench under **Model size & facing**:

- `renderScale` — how big this rig is drawn against the character's
  head-height target. It is a hand setting, because "how tall the character is"
  and "how tall the model measures" differ for reasons that are a judgement
  call: nobody idles at full stretch, a stance with the legs apart drops the
  hips, and the top of the art is hair rather than skull. The panel offers the
  measurement (`idle measures 1.61 m against 1.70 m declared → 1.056× would
  stand exactly 157 px`) and a one-click **Use measured**, but the number is
  yours.
- `yawOffsetDeg` — which way the rig faces. The delivery spec says forward is
  +Z; a model built the other way round faces backwards in every state and no
  clip can fix it, because the whole rig is turned. 180 is the common case
  (Maki and Uro both arrived this way).

The comparison sprite can stand BESIDE the model instead of ghosting under it
(the honest side-by-side for "does this match the sprite"), and the viewer
zooms — slider, ± buttons, scroll wheel — and pans by dragging the background,
which is what makes a 384 px render's hands editable at all.

Smoke: `node tools/smoke_pose_edit.mjs` — handles land on joints under zoom and
pan, the drag leaves the limb pointing at the pointer to within a degree, an
edit lands on the selected extreme and the rebuilt clip eases through it, the
two spaces stay apart, and both delivery dials bite.

Smoke: `node server.mjs` then `node tools/smoke_render3d.mjs` — mannequin
match, on-twos render budget, pixel probe, determinism (same token ->
identical pixels), and the delivered-.glb intake path end to end.

Also `node tools/smoke_facing.mjs` — which way the fighter faces and that the
live layers nod rather than twist, on BOTH model backends. Both were wrong on
the first delivery and neither was visible at 384 px, so they are measured as
dot products and degrees instead of looked at.
