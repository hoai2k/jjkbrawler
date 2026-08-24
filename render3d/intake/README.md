# `render3d/intake/` — where 3D model deliveries land

**Upload rigs here, never to `render3d/assets/`.** This intake is the
render3d sibling of `billboards/intake/` — same shape, same tool, different
registry: a rig imported here registers for `?render=3d`, a rig imported
there registers for `?render=billboard`. Because the two backends share one
delivery spec and one clip contract, **the same .glb is valid in both** — a
fighter approved for billboards can be copied into this intake and imported
here the same day.

```
render3d/intake/<char>/<char>.glb          one fighter: rig + mesh +
                                           materials + their bespoke clips
render3d/intake/<char>/_raw.glb            the upload, when it had to be
                                           conformed to become the above
render3d/intake/_shared/library.glb        the 14 shared locomotion clips
render3d/intake/_shared/<archetype>.glb    a normals set (unarmed, blade, …)
```

A **fix** to a fighter who is already in the repo comes back the same way and
through the same folder: one `.glb` per fighter, containing everything they had
before plus the change. What is asked for, and what an export must not lose on
the way, is [../docs/blender-requests.md](../docs/blender-requests.md).

The delivery spec is the billboard spec **plus the D-spec additions**
(shade-bias alpha, outline vertex-color channel, edited normals, shade-tint
extras): [../docs/asset-requests.md](../docs/asset-requests.md). Read it
before generating anything.

## The flow

```
node tools/conform_delivery.mjs <char> --apply          # only if it is raw
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
# review in the 3D workbench:  /render3d/workbench/?char=<char>
#   — sweeping-light face check FIRST, then each state against its sprite
#     ghost, at the beat, under the aim crosshair, facing both ways —
# then export the payload it builds and:
node tools/billboard_intake.mjs apply payload.json --backend 3d
node tools/billboard_intake.mjs list --backend 3d
```

## When the upload is not a delivery

`validate` refuses a file that does not meet the spec, and says which fact is
wrong. What it cannot say is that a whole CLASS of upload is wrong in the same
four ways every time — which is what round D7 arrived as, five Blender/Rigify
exports run through `gltfpack`: meshopt-compressed rather than plain glTF,
`DEF-upper_arm.L` rather than `LeftArm`, a FLAT skeleton (gltfpack drops the
joint hierarchy when a file carries no animations, so the arms come out as
siblings of the spine and turning the chest leaves them behind), and
normalised to a unit cube at 120k–300k triangles.

`node tools/conform_delivery.mjs <char> --apply` is the pass that turns one
into a delivery: it decodes, renames onto the standard skeleton, rebuilds the
hierarchy without moving a single joint, scales to the character's canon
height with the origin on the floor between the feet, decimates to the 30k
budget and writes the one clip the engine does not build for itself (the
stand). The upload is kept beside it as `_raw.glb`, so the delivery is always
reproducible from what was actually delivered. Two more passes handle what is
wrong with a skin rather than with a container:

```
node tools/rigidify_prop.mjs <char> --apply     # a fused weapon onto Prop_Main
node tools/prune_hem_weights.mjs <char> --apply # an arm off a skirt or a thigh
```

**Close the tears first, before the review.** A generated mesh arrives with
holes in it — rims where the generator ended the surface rather than guess at
what the seed boards never showed it, most often under a forearm or behind a
thigh — and they read in game as slits showing the inside of the body. Every
delivered model but three had them.

```
python3 tools/fill_model_holes.py --file render3d/intake/<char>/<char>.glb
python3 tools/fill_model_holes.py --apply --file render3d/intake/<char>/<char>.glb
```

A cap adds one vertex per rim position and invents **only its texture
coordinate**: position, normal and the skin weights are copied from the rim
vertex it sits on, so the patch is driven by the same bones as the surface
around it. The UV is a single coordinate for the whole cap, read off the
surviving surface, so the patch comes out the colour of what it patches — the
`UVx` column reports the worst cap's atlas footprint as a multiple of a normal
triangle's, and anything over 2× is a cap that will smear. Rims wider than a
quarter of the figure's height are left alone as hems (a skirt, a coat, a
sleeve cuff), so read what it skips.
`tools/build_model.sh` runs it as a step; a hand-built delivery needs it run
by hand.

(One intake validator serves both backends — extended, not forked — which is
the structural answer to spec drift; see plan.md §9.)

`import` never approves. A rig registers in the game **all-or-nothing** when
its manifest entry (`render3d/assets/manifest.json`) says `approved: true`.
Until then — and wherever states are missing clips — the character draws
their sprites or inherits poses per the manifest's inheritance rules
(`resolveClip` in `../src/loader.js`).

Raw deliveries stay here after import as the working copy under review; once
a round is fully integrated, archive them to
`assets/reference/render3d-<round>/` the way sprite plates move to
`assets/reference/round<N>/`. Rounds D1–D6 are in
`assets/reference/render3d-d1-d6/`, D7 in `assets/reference/render3d-d7/`,
which is why this folder is empty: nothing here is under review.
