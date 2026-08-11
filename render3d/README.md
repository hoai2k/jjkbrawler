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
numbers: it puts a handle on every joint, and dragging one rotates its PARENT
bone so the limb points at the pointer. Joints that are hard to hit (a hand
behind the hip, a neck inside the collar) are reachable from **Selected
joint** in the panel, with per-axis sliders. **Output changes** downloads
`pose-edits.json`:

```json
{ "kind": "render3d-pose-edits",
  "characters": { "yuji": { "light": {
    "offsetsDeg":    { "RightForeArm": [116.9, 2.3, -13.8] },
    "atClipTime":    0.083,
    "resultLocalDeg":{ "RightForeArm": [26.0, -77.3, -123.7] } } } } }
```

`offsetsDeg` is the correction, in each bone's parent frame, applied on top of
the state's clip for its whole duration (the edit layer in `src/pose.js`).
`resultLocalDeg` is the absolute local rotation the bone ends at, which is the
shape a pose-table entry takes (`billboards/src/mannequin.js` `POSES`) — so a
posed note can be applied to the clips rather than interpreted. Edits are
per (character, state, bone) and live in the page only; nothing on disk moves
until the JSON is applied by hand.

The comparison sprite can stand BESIDE the model instead of ghosting under it
(the honest side-by-side for "does this match the sprite"), and the viewer
zooms — slider, ± buttons, scroll wheel — and pans by dragging the background,
which is what makes a 384 px render's hands editable at all.

Smoke: `node tools/smoke_pose_edit.mjs` — handles land on joints under zoom
and pan, the drag leaves the limb pointing at the pointer to within a degree,
a held pose does not drift while it is previewed, and the payload carries what
was moved.

Smoke: `node server.mjs` then `node tools/smoke_render3d.mjs` — mannequin
match, on-twos render budget, pixel probe, determinism (same token ->
identical pixels), and the delivered-.glb intake path end to end.

Also `node tools/smoke_facing.mjs` — which way the fighter faces and that the
live layers nod rather than twist, on BOTH model backends. Both were wrong on
the first delivery and neither was visible at 384 px, so they are measured as
dot products and degrees instead of looked at.
