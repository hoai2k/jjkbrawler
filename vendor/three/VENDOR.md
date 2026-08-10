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
modules are the only way to ship a dependency. This copy lives at
`/vendor/three/` and is SHARED by the two model-drawing backends — **only
`billboards/src/`, `render3d/src/` and their workbenches may import from
here**, and the game-facing modules only via dynamic `import()` — the game's
entry path must not load ~2 MB of 3D engine for players who never pick
`?render=billboard` or `?render=3d`. One copy, one version: the moment the two
backends need different three.js versions, something has gone wrong upstream.
`tools/check_imports.mjs` does not scan this directory; it is third-party
code, not ours to lint.
