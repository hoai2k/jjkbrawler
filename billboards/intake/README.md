# `billboards/intake/` — where model deliveries land

**Upload rigs here, never to `billboards/assets/`.** This intake is the 3D
sibling of `assets/intake/` and deliberately shares nothing with it: sprite
intake cuts alpha off key screens with Python and imagery tools; this one
validates glTF containers with `tools/billboard_intake.mjs`. Different
formats, different checks, different tools — keeping them separate means
neither pipeline can quietly damage the other's deliveries.

```
billboards/intake/<char>/<char>.glb        one fighter: rig + mesh +
                                           materials + their bespoke clips
billboards/intake/_shared/library.glb      the 14 shared locomotion clips
billboards/intake/_shared/<archetype>.glb  a normals set (unarmed, blade, …)
```

The delivery spec — units, orientation, skeleton naming, prop bones
(`Prop_Main` / `Prop_Off` / `Prop_Float`), physics chains
(`Chain_<name>_<i>`), clip names and timing — is
[../docs/asset-requests.md](../docs/asset-requests.md). Read it before
generating anything; every check the tool runs comes from there.

## Conforming a generated rig first

A generator's output rarely matches the spec on arrival: Tripo and Mixamo each
have their own bone naming, their own scale, and clip timings that owe nothing
to our combat tuning. That gap is mechanical, so it is a script — run headless,
no GUI:

```
blender --background --python tools/blender_conform.py -- \
    --in  billboards/intake/yuji/_raw.glb \
    --out billboards/intake/yuji/yuji.glb \
    --char yuji
```

It renames bones onto the standard skeleton (stripping `mixamorig:` and
mapping common spellings), scales to the fighter's canon height in metres with
feet on the floor and transforms applied, renames and retimes each action to
its state's duration from `../src/states.js`, and adds any prop/chain hook
bones the roster expects. It never invents animation: a clip whose *content* is
wrong is a workbench review finding, not something a script can fix.

## The flow

```
node tools/billboard_intake.mjs validate <char>   # hold it against the spec
node tools/billboard_intake.mjs import <char>     # copy to assets/, register
                                                  #   in manifest, approved: false
# review in the billboard workbench:  /billboards/workbench/?char=<char>
#   — each state against its sprite ghost, aim target, props, chains —
# then export the payload it builds and:
node tools/billboard_intake.mjs apply payload.json
node tools/billboard_intake.mjs list              # where everything stands
```

`import` never approves. A rig registers in the game **all-or-nothing** when
its manifest entry says `approved: true` — the same shape as the sprite
pipeline's approval step and the transform-readiness check, and for the same
reason: art is in the repo before it is in the game, and what players see is
what was reviewed. Until then (and wherever states are missing clips) the
character draws their sprites, or inherits poses per the manifest's
inheritance rules — see `resolveClip` in `../src/rig.js`.

Raw deliveries stay here after import as the working copy under review;
once a round is fully integrated, archive them to
`assets/reference/billboards-round<N>/` the way sprite plates move to
`assets/reference/round<N>/`.
