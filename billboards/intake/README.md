# `billboards/intake/` — retired; deliver to `render3d/intake/`

Rigs no longer land here. The billboard backend does not keep its own copy of
the roster any more: it **draws render3d's rigs as cards**, so there is one
place a delivery arrives and one record of what arrived.

```
render3d/intake/<char>/<char>.glb     every rig, whichever backend draws it
node tools/billboard_intake.mjs validate|import|approve <char>
```

The `--backend` flag is gone (accepted and ignored, so an old command still
works). Review in the **[3D workbench](../../render3d/workbench/)**, which is where
clip inheritance, approval, facing, size and stance are set; the
[billboard workbench](../workbench/) shows what those produced on a
card and edits nothing.

**Why it was retired.** Both backends loaded byte-identical `.glb` files from
two asset trees with two manifests, and the manifests drifted: a facing review
turned 22 of 27 fighters in one and left the other drawing them the old way.
Nothing failed — the same fighter simply faced two directions depending on
which backend you were looking at.
