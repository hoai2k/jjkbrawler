# Round D7 — the Rigify rebuilds, as delivered

Five raw uploads: Yuji, Nobara, Mahito and Jogo rebuilt over their Tripo
originals, and Naoya, who had no rig before. Archived here the way sprite
plates move to `assets/reference/round<N>/` — the round is integrated, so the
delivery leaves `render3d/intake/`.

**These are the files as they arrived, not what the game loads.** Each one is
a Blender/Rigify export run through `gltfpack`, which is four things the
delivery spec is not: meshopt-compressed, `DEF-`named, flat-skeletoned (the
arms are siblings of the spine — gltfpack drops the joint hierarchy when a
file has no animations) and normalised to a unit cube at 120k–300k triangles.
`tools/conform_delivery.mjs` is what turned each into a delivery, and the
whole round is reproducible from what is here:

    mkdir -p render3d/intake/yuji
    cp assets/reference/render3d-d7/yuji/yuji.glb render3d/intake/yuji/_raw.glb
    node tools/conform_delivery.mjs yuji --apply
    node tools/rigidify_prop.mjs   yuji --intake --apply   # only a weapon carrier
    node tools/prune_hem_weights.mjs yuji --intake --apply
    node tools/billboard_intake.mjs import yuji --backend 3d

What the conformed rigs measure, and what was done to them beyond the
conform, is in [render3d/docs/asset-requests.md](../../../render3d/docs/asset-requests.md)
under Round D7.
