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
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
# review in the 3D workbench:  /render3d/workbench/?char=<char>
#   — sweeping-light face check FIRST, then each state against its sprite
#     ghost, at the beat, under the aim crosshair, facing both ways —
# then export the payload it builds and:
node tools/billboard_intake.mjs apply payload.json --backend 3d
node tools/billboard_intake.mjs list --backend 3d
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
`assets/reference/render3d-round<N>/` the way sprite plates move to
`assets/reference/round<N>/`.
