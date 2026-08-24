// CLOTHING FX — a character's garments keyed out of their own drawing, live.
//
// Uro is sometimes drawn in the anime with her cloud garments keyed out, so the
// background shows through where the cloth is. This does that to the shipped
// sprites at runtime: no second art layer, no re-export, just a per-frame pass
// over the pixels the first time a frame is drawn with the setting on.
//
// It is OFF by default and it is a look, not a mechanic. Nothing here can move
// a hitbox, a measurement or a placement: the pass returns a canvas the same
// size as the source image with some pixels' alpha lowered, and every number
// the game reads about a body still comes off `meta` and the manifest.
//
// WHY IT IS A KEY AND NOT A MASK. The sprites are flat drawings — there is no
// body layer under the garment — so this cannot make cloth *translucent*, only
// absent. On Uro that reads (her outfit is cloud, and cloud thinning into sky
// is the character), and `hem` keeps her drawn outline so the edge is a hem
// rather than a tear. On a fighter in a jacket it would read as a hole, which
// is why GARMENTS is an opt-in table of one rather than something every
// character gets. Sheet: docs/experiments/uro-seethrough/.
//
// IT KEYS SPRITE ART, WHEREVER SPRITE ART IS DRAWN — and there are TWO places,
// which is the bug this feature shipped with and the reason for this notice.
//
//   sprites/src/sprites.js  drawCharFrame — the flat 2D blit
//   src/camera3d/billboards.js  drawChar  — the 2.5D camera's sprite card,
//                                           which deliberately does NOT call
//                                           drawCharFrame: it replays the same
//                                           transform chain as a matrix and
//                                           blits the image itself
//
// The 2.5D camera is ON by default, so the second one is the path a player
// actually sees. Hooking only the first left the effect invisible in every
// real match while the settings toggle, the pass and the arena bench all
// worked — the bench draws flat. Anything that reaches for `frameImage()` to
// put a CHARACTER on screen has to come through here, or it silently opts out
// of the effect. tools/smoke_clothing_fx.mjs asserts on the framebuffer of a
// real match for exactly this reason.
//
// The MODEL backends (Settings -> Render: Billboards, 3D) draw rigs, not
// drawings, so there is nothing to key for a character who has one; a
// character without a rig falls through to the sprite card above and is keyed
// like any other. Expressing this as a material on the garment is what those
// paths would want, and is different work.
//
// DEPENDENCY-FREE ON PURPOSE. The spike tool (tools/uro_seethrough_test.mjs)
// imports this same file into a browser page to render its comparison sheets,
// so what the tool measures is what the game draws.

/** The toggle behind Settings → "Clothing FX". Owned here rather than in
 *  `state` because the cache below is owned here too, the way audio.js owns
 *  `audioSettings`. `setClothingFx` is the only writer. */
export const clothingFx = { enabled: false };

/** Turn the effect on or off. Returns the resulting state. The frame cache
 *  survives, so toggling back on is instant. */
export function setClothingFx(on) {
  clothingFx.enabled = !!on;
  return clothingFx.enabled;
}

// --------------------------------------------------------------- profiles

/** Who has keyable garments, and what the cloth looks like in the drawing.
 *
 *  A profile is only sound when the garment occupies a hue band nothing else
 *  on that character's body uses. Uro's cloud is cyan against orange skin,
 *  violet hair and brown leather; that separation is the whole reason this
 *  works without a hand-painted mask. Adding a character means checking the
 *  same thing about them, not copying these numbers.
 */
export const GARMENTS = {
  uro: {
    // Saturated cyan: the cloth itself. These pixels seed the flood.
    seed: { hMin: 165, hMax: 225, sMin: 0.10, vMin: 0.45 },
    // Pixels the flood may spread INTO but which never start one: the white
    // cloud interiors, and the pale cyan at the cloth's soft edge. Kept
    // conditional so her eye whites and skin highlights — connected to no
    // cyan — are never taken.
    grow: { hMin: 150, hMax: 235, sMin: 0.05, vMin: 0.55, whiteSMax: 0.14, whiteVMin: 0.80 },
    // A garment band is big, sits between the shoulder line and mid-thigh, and
    // straddles the body's centre line. Her cursed-energy palm FX is the SAME
    // cyan as the cloth — without this it keys her forearm off at the wrist on
    // every palm-strike pose.
    region: { minPixels: 400, yMin: 0.18, yMax: 0.85, xMax: 0.35 },
    // Erode the mask by this many pixels so the garment's own dark outline
    // survives at full alpha. Without it the opening reads as a tear; with it,
    // as a hem. In SOURCE pixels — `sample` cannot change how wide it lands.
    hem: 3,
    // Work the mask out at 1/N resolution. Uro's frames are drawn ~1400px tall
    // and reach the screen about 210px tall, so the art carries ~7x the detail
    // the effect can ever show; at N=2 the mask is still ~3x finer than the
    // pixels it lands on, and the pass costs a quarter as much. Raising this
    // further is a real trade — the edge starts to stair-step in the workbench,
    // which draws the art far larger than a match does.
    sample: 2,
    // What is left of the cloth inside the hem. 0 is the anime look.
    alpha: 0,
    // POSES THE EFFECT IS WRONG ON, and why there is a list at all: her set is
    // not drawn in one outfit. Most poses are the two cloud bands; a few
    // (crouch_b, grab_hold) are a one-piece, which keys to a bigger opening and
    // still reads as her. `prone` is drawn in a full-length gown, and keying
    // that leaves a head, one arm and a wisp — she is not on screen any more.
    //
    // The contact sheet is how this list gets decided, and the only way it can
    // be: node tools/uro_seethrough_test.mjs --contact.
    skip: ["prone"],
  },
};

/** Does this character have anything to key? */
export function hasClothingFx(charKey) {
  return !!GARMENTS[charKey];
}

// ------------------------------------------------------------------ cache
//
// Keyed on the SOURCE IMAGE rather than on charKey/frameKey, so a frame that
// is reloaded, previewed or swapped for an alternate gets its own entry and no
// stale drawing can survive a change to the art. Weak, so those entries go
// when the image does.
let live = new WeakMap();

// Frames whose pass threw — a tainted canvas, most likely, which happens when
// the game is opened over file:// instead of through server.mjs. Recorded so
// the failure costs one attempt rather than one per drawn frame, and so the
// effect degrades to "draws normally" rather than to an exception per frame.
let failed = new WeakSet();

/** Drop every cached frame. For the workbench, which repaints art in place. */
export function clearClothingFx() {
  live = new WeakMap();
  failed = new WeakSet();
}

// ----------------------------------------------------------------- the pass

/** The garment mask for one frame: a Uint8Array of 0/1, one per pixel.
 *
 *  Exported because the spike tool renders its comparison sheets from exactly
 *  this, and because it is the part worth testing on its own — the rest of the
 *  file is caching and canvas plumbing.
 */
export function garmentMask(imageData, profile) {
  const { data: d, width: srcW, height: srcH } = imageData;
  const { seed, grow, region } = profile;
  // Everything below works on an N-times-coarser grid; `at(p)` is where that
  // grid's pixel p starts in the source bytes. N=1 makes it the source itself.
  const N = Math.max(1, Math.round(profile.sample || 1));
  const W = Math.ceil(srcW / N);
  const H = Math.ceil(srcH / N);
  const at = (x, y) => (Math.min(srcH - 1, y * N) * srcW + Math.min(srcW - 1, x * N)) * 4;

  // --- 1. classify. 2 = seed, 1 = may be grown into, 0 = keep. -----------
  //
  // Written to skip work rather than to read prettily: this is 700k pixels per
  // frame and 48 frames per character, and a per-pixel HSV that allocated an
  // object put the whole warm at ~4 seconds. Value and saturation come off the
  // channel max and min; HUE is only computed for pixels that could still be
  // cyan, which is the ones whose max channel is green or blue. Skin — every
  // pixel of which is red-max — never reaches the hue maths at all.
  const cls = new Uint8Array(W * H);
  // The two bands' loosest thresholds: below these a pixel cannot be either,
  // so it never reaches the hue maths.
  const sGate = Math.min(seed.sMin, grow.sMin);
  const vGate = Math.min(seed.vMin, grow.vMin);
  for (let p = 0; p < cls.length; p++) {
    const x = p % W;
    const i = at(x, (p - x) / W);
    if (d[i + 3] < 8) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (max === 0) continue;
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = max / 255;
    const sat = (max - min) / max;
    let h = -1;
    // Red-max is never cyan, which is every pixel of skin — the largest part
    // of the drawing, and the reason this gate is worth its line.
    if (max !== r && sat >= sGate && v >= vGate) {
      const span = max - min;
      h = max === g ? 60 * ((b - r) / span + 2) : 60 * ((r - g) / span + 4);
      if (h < 0) h += 360;
    }
    if (h >= seed.hMin && h <= seed.hMax && sat >= seed.sMin && v >= seed.vMin) cls[p] = 2;
    else if (sat < grow.whiteSMax && v >= grow.whiteVMin) cls[p] = 1;
    else if (h >= grow.hMin && h <= grow.hMax && sat >= grow.sMin && v >= grow.vMin) cls[p] = 1;
  }

  // --- 2. label the seed regions, measuring each as it goes -------------
  // Two passes rather than one: this one decides which regions are garments,
  // and only then does the flood spread into the near-white neighbours. A
  // single pass would let the cloud interiors carry a region across the gap
  // between the cloth and something else pale.
  const label = new Int32Array(W * H).fill(-1);
  const regions = [];
  // One preallocated stack for both floods. A plain array grown to hundreds of
  // thousands of entries and handed back to the collector twice per frame was
  // a measurable slice of the warm on its own.
  const stack = new Int32Array(W * H);
  let sp = 0;
  for (let start = 0; start < cls.length; start++) {
    if (cls[start] !== 2 || label[start] >= 0) continue;
    const id = regions.length;
    const box = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    regions.push(box);
    label[start] = id;
    stack[sp++] = start;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      box.n++;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const q = ny * W + nx;
          if (label[q] >= 0 || cls[q] !== 2) continue;
          label[q] = id;
          stack[sp++] = q;
        }
      }
    }
  }

  // --- 3. which regions are clothing ------------------------------------
  // Measured against the drawn body, not the image: the frames are cropped
  // per pose, so a fixed fraction of the FILE would mean something different
  // in every one of them.
  let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
  for (let p = 0; p < cls.length; p++) {
    const x = p % W;
    const y = (p - x) / W;
    if (d[at(x, y) + 3] < 24) continue;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  const bh = by1 - by0 || 1;
  const bw = bx1 - bx0 || 1;
  const cx = (bx0 + bx1) / 2;
  const keep = new Uint8Array(regions.length);
  for (let id = 0; id < regions.length; id++) {
    const box = regions[id];
    if (box.n < region.minPixels) continue;
    const midY = ((box.y0 + box.y1) / 2 - by0) / bh;
    const midX = ((box.x0 + box.x1) / 2 - cx) / bw;
    if (midY < region.yMin || midY > region.yMax) continue;
    if (Math.abs(midX) > region.xMax) continue;
    keep[id] = 1;
  }

  // --- 4. grow the kept regions into the pale pixels touching them ------
  let mask = new Uint8Array(W * H);
  for (let p = 0; p < mask.length; p++) {
    if (label[p] >= 0 && keep[label[p]]) { mask[p] = 1; stack[sp++] = p; }
  }
  while (sp) {
    const p = stack[--sp];
    const x = p % W;
    const y = (p - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        const q = ny * W + nx;
        if (mask[q] || cls[q] !== 1) continue;
        mask[q] = 1;
        stack[sp++] = q;
      }
    }
  }

  // --- 5. hem: erode, so the drawn outline of the cloth survives --------
  // In source pixels, so a coarser grid needs fewer passes to erode as far.
  const hemPasses = profile.hem ? Math.max(1, Math.round(profile.hem / N)) : 0;
  for (let pass = 0; pass < hemPasses; pass++) {
    const next = new Uint8Array(mask);
    for (let p = 0; p < mask.length; p++) {
      if (!mask[p]) continue;
      const x = p % W;
      const y = (p - x) / W;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) { edge = true; break; }
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W || !mask[ny * W + nx]) { edge = true; break; }
        }
      }
      if (edge) next[p] = 0;
    }
    mask = next;
  }

  if (N === 1) return mask;
  // Back up to the source grid. Nearest-neighbour: the mask is binary, and an
  // interpolated edge would only reintroduce the half-keyed fringe the hem
  // erode exists to avoid.
  const full = new Uint8Array(srcW * srcH);
  for (let y = 0; y < srcH; y++) {
    const row = ((y / N) | 0) * W;
    const out = y * srcW;
    for (let x = 0; x < srcW; x++) full[out + x] = mask[row + ((x / N) | 0)];
  }
  return full;
}

/** Run the pass over one loaded image and return a canvas of the result.
 *  Null when the pixels cannot be read (a tainted canvas under file://). */
function keyFrame(img, profile) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const cx = c.getContext("2d", { willReadFrequently: false });
  cx.drawImage(img, 0, 0);
  let frame;
  try {
    frame = cx.getImageData(0, 0, W, H);
  } catch {
    return null;    // cross-origin / file:// — the drawing is unreadable
  }
  const mask = garmentMask(frame, profile);
  const d = frame.data;
  const alpha = profile.alpha || 0;
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * alpha);
  }
  cx.putImageData(frame, 0, 0);
  return c;
}

/** THE DRAW HOOK. Given the frame and the image it would be drawn from, return either
 *  it or the keyed version — same dimensions either way, so the caller's
 *  placement maths is untouched.
 *
 *  Safe to call for every character on every frame: it costs a table lookup
 *  and a WeakMap hit once the frame is warm, and returns `img` unchanged for
 *  everyone without a profile or when the setting is off. */
export function clothingFrame(charKey, frameKey, img) {
  if (!clothingFx.enabled || !img) return img;
  const profile = GARMENTS[charKey];
  if (!profile) return img;
  if (profile.skip?.includes(frameKey)) return img;
  const map = live;
  const hit = map.get(img);
  if (hit) return hit;
  if (failed.has(img)) return img;
  const keyed = keyFrame(img, profile);
  if (!keyed) {
    failed.add(img);
    return img;
  }
  map.set(img, keyed);
  return keyed;
}

/** Do the work for a whole character's art NOW, so the first draw of each pose
 *  is not the one that pays for it. `frames` is `[frameKey, image]` pairs.
 *
 *  A single Uro frame is a ~700k-pixel flood fill: fine once, visibly late if
 *  it lands on the frame she first throws a palm on. main.js calls this behind
 *  the VS splash, where a few hundred milliseconds are already being spent. */
export function warmClothingFx(charKey, frames) {
  if (!clothingFx.enabled || !GARMENTS[charKey]) return 0;
  let n = 0;
  for (const [frameKey, img] of frames) {
    if (!img) continue;
    if (!live.get(img)) n++;
    clothingFrame(charKey, frameKey, img);
  }
  return n;
}
