# Vendored: meshoptimizer 1.2.0 (npm `meshoptimizer`)

Copied from the npm package, MIT licensed (LICENSE.md beside the files):

    meshoptimizer/decoder.mjs      package/meshopt_decoder.mjs, verbatim
    meshoptimizer/simplifier.mjs  package/meshopt_simplifier.js, verbatim

Renamed only, not edited — both are plain ES modules with a single named
export (`MeshoptDecoder`, `MeshoptSimplifier`), so upgrading is: copy the two
files, rename, update the version here.

**Tools only. Nothing here ships to a player**, which is why it lives under
`tools/` rather than beside `/vendor/three/`: the game never meets a
meshopt-compressed asset, because `tools/conform_delivery.mjs` decodes one on
the way in and writes a plain .glb into `render3d/assets/`. Putting the
decoder in the runtime instead would mean every player downloads a WASM
decoder so that four rigs can arrive compressed.

`tools/conform_delivery.mjs` is the only importer:

- **decoder** — a delivery run through `gltfpack` stores its buffer views
  under `EXT_meshopt_compression`, which is not core glTF and which nothing
  else in this repo (the intake validator, the hole filler, the bind baker)
  can read. Decoding is the first thing conform does.
- **simplifier** — the same deliveries arrive at 120k–300k triangles against
  a 30k budget (`render3d/docs/asset-requests.md`), and the roster they join
  sits at 29.7k–30k to a fighter. This is what brings them down to it.
