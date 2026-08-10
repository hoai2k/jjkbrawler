// Ink outlines — the inverted-hull pass that draws the line around a fighter.
//
// For every mesh in a rig, a back-face shell is added as a sibling: the same
// geometry (and, for skinned meshes, the same skeleton — the shell animates
// with the body for free), pushed out along its normals by a width measured
// in SCREEN PIXELS. scene.js converts pixels to world units per render from
// the camera framing, so the line holds its weight whatever size the fighter
// blits at — the "drawn with one pen" rule.
//
// PER-VERTEX WIDTH.  Delivered rigs may paint vertex color channel R
// (0..1, default 0.5): 0.5 is nominal width, 1.0 doubles it (the thick jaw
// and silhouette lines), near 0 tapers to a hairline (interior details).
// Rigs without vertex colors get the uniform width everywhere.
//
// Interior detail lines are NOT generated here — they are painted in the
// baseColor texture by the artist (cheaper, calmer, more "drawn"); this pass
// only owns the silhouette and crease shell.

/** Outline defaults; the workbench edits these live via setOutline. */
export const OUTLINE = {
  px: 1.6,                        // line width in blitted screen pixels
  color: [0.055, 0.05, 0.085],    // near-black, cool — reads as ink, not soot
  opacity: 1.0,
};

const LIVE = new Set();

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uWidth;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  float w = uWidth;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    // vertex color R tapers the line: 0.5 = nominal, 1.0 = double, 0 = gone
    w *= color.r * 2.0;
  #endif
  vec3 transformed = position + normalize( objectNormal ) * w;
  #include <skinning_vertex>
  gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4( uColor, uOpacity );
}
`;

function makeOutlineMaterial(THREE, mesh) {
  const geo = mesh.geometry;
  const hasWidthChannel = !!geo?.attributes?.color;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uWidth: { value: 0.01 }, // world units; scene.js sets the real value per render
      uColor: { value: new THREE.Color(...OUTLINE.color) },
      uOpacity: { value: OUTLINE.opacity },
    },
    side: THREE.BackSide,
    // vertexColors makes three declare the `color` attribute (vec3 or vec4)
    // and define USE_COLOR / USE_COLOR_ALPHA to match the geometry.
    vertexColors: hasWidthChannel,
  });
  LIVE.add(mat);
  return mat;
}

/** Add the ink shell to every mesh under `root`. Idempotent: shells are
 *  marked and skipped on a second pass. A mesh (or its whole material) can
 *  opt out via glTF extras `"outline": false` — eye whites and effect cards
 *  usually should. */
export function addOutlines(THREE, root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.hasOutline) meshes.push(o);
  });
  for (const mesh of meshes) {
    if (mesh.userData.outline === false || mesh.material?.userData?.outline === false) continue;
    const shell = mesh.clone(false);
    shell.material = makeOutlineMaterial(THREE, mesh);
    shell.userData = { isOutline: true };
    mesh.userData.hasOutline = true;
    mesh.parent.add(shell);
  }
}

/** Convert the pixel width into world units for this render — scene.js calls
 *  it with (world units per blitted pixel) just before drawing. */
export function setWorldWidth(root, worldPerPx) {
  root.traverse((o) => {
    if (o.userData.isOutline) o.material.uniforms.uWidth.value = OUTLINE.px * worldPerPx;
  });
}

/** Workbench dials: width in px, ink color, opacity. */
export function setOutline(partial) {
  Object.assign(OUTLINE, partial);
  for (const mat of LIVE) {
    if (partial.color) mat.uniforms.uColor.value.setRGB(...partial.color);
    if (partial.opacity !== undefined) mat.uniforms.uOpacity.value = partial.opacity;
    // px takes effect on the next render via setWorldWidth
  }
}
