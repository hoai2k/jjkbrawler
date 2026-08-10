# Vendored: three.js r185 (npm `three@0.185.1`)

Copied from the npm package, MIT licensed (LICENSE beside this file):

    three.core.js                  package/build/three.core.js, verbatim
    three.module.js                package/build/three.module.js, verbatim
    loaders/GLTFLoader.js          package/examples/jsm/loaders/GLTFLoader.js
    utils/BufferGeometryUtils.js   package/examples/jsm/utils/…
    utils/SkeletonUtils.js         package/examples/jsm/utils/…

The only edit: the three files under loaders/ and utils/ import from the bare
specifier `'three'`, which needs an import map this no-build repo does not
have — each had that one line rewritten to `'../three.module.js'`. Nothing
else is modified, so upgrading is: copy the new files, redo the one-line
rewrite, update the version here.

Vendored because the repo has no build step and no runtime npm: plain ES
modules are the only way to ship a dependency.

**Two features import from here, each gated behind its own URL param:**

    billboards/src/    ?render=billboard — posed 3D models blitted into the 2D world
    src/render3d/      ?camera=3d        — the 2.5D perspective camera

The rule is about the ENTRY PATH, not about any one import statement: a player
who picks neither must never download ~2 MB of 3D engine, so **nothing
statically reachable from `src/main.js` may name this directory**. Either way
of honouring that is fine — `billboards/src/billboard.js` reaches it through a
dynamic `import()` inside an otherwise-static module, while `src/render3d/*`
imports it statically and is itself only ever `import()`ed once main.js has
seen `?camera=3d`. What is NOT fine is a static import chain from main.js. It also has to stay ONE
copy. Two features vendoring three.js separately is not merely 2 MB wasted —
running both modes at once would instantiate two engines whose classes are
mutually unrecognisable (a `Mesh` from one is not a `Mesh` to the other), and
the failure surfaces as objects silently not rendering rather than as an
error. That is why this sits at the repo root instead of under either feature.

`tools/check_imports.mjs` does not scan this directory; it is third-party
code, not ours to lint.
