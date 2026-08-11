// Keyframes and curves: the layer between a pose TABLE — a handful of extreme
// poses with a timing — and the AnimationClip the mixer plays.
//
// It exists because of what an animator actually wants to touch. The extremes
// are the drawing: the contact pose of a run, the full extension of a strike,
// the deepest point of a landing. Everything between them is arithmetic, and
// arithmetic authored by hand as more keyframes is arithmetic that goes stale
// the moment an extreme moves. So the tables here hold extremes only, each
// segment says how to get to the next one, and this module bakes the result.
//
// TWO THINGS IT ADDS OVER A PLAIN KEYFRAME TRACK
//
//   * CURVES. three.js interpolates quaternion tracks LINEARLY and offers no
//     smoothing for them (cubic interpolation exists for vector tracks only) —
//     so every authored motion arrived at constant angular speed, started
//     instantly and stopped dead. That is the single largest reason the clip
//     library read as stiff next to the sprites, which get their snap from a
//     human choosing where the drawings bunch up. Each segment names an ease
//     and is BAKED into dense sub-keys through it, so the mixer's linear
//     interpolation reproduces the curve.
//
//   * A ROUND TRIP. `clipToKeys` reads any clip — including a delivered .glb's
//     — back into the same table shape, so the workbench's pose editor can
//     edit a rig's own animation, not just the default set.
//
// The engine contract is unchanged and enforced here rather than trusted: the
// CONTACT BEAT is always an exact sample (pose.js snaps to it and the hitbox
// goes live there), a looping clip's last key equals its first, and clips
// still bake no engine motion — bob, squash, tumble and dodge spin belong to
// motion.js in every backend.

const DEG = Math.PI / 180;

/**
 * Segment easings. `u` is the fraction of the way from this key to the next;
 * the return is how far along the POSE that fraction has actually travelled.
 *
 * The names are animation names, not maths names, because the choice is an
 * animation one:
 *
 *   hold    nothing moves until the next key. A held pose, a frozen wind-up.
 *   linear  constant speed. Machinery, and the fallback for anything read
 *           back out of a delivered clip (its curve is already baked in).
 *   ease    slow out, slow in — the default for anything cyclic.
 *   in      accelerate out of the pose: an anticipation winding up.
 *   out     decelerate into the pose: a settle, a follow-through dying away.
 *   snap    almost all the travel in the first fifth, then a long glide. This
 *           is the strike curve — the reason a punch reads as fast is that it
 *           spends most of its frames already extended.
 *   back    overshoots and comes back. A recoil, a weight settling.
 */
export const EASES = {
  hold: () => 0,
  linear: (u) => u,
  ease: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  snap: (u) => 1 - Math.pow(1 - u, 5),
  back: (u) => {
    const c = 1.70158, c3 = c + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
  },
};
export const EASE_NAMES = Object.keys(EASES);

/** Samples per second a non-linear segment is baked at. 60 is the game's own
 *  frame rate: bake finer and the mixer interpolates between samples nobody
 *  can see; bake coarser and the ease itself starts to step. */
const BAKE_HZ = 60;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Every bone name any key in the table mentions. */
export function bonesIn(keys) {
  return [...new Set(keys.flatMap((k) => Object.keys(k.pose || {})))];
}

/**
 * The sample times for one segment. A linear or held segment needs only its
 * endpoints; a curved one is baked at BAKE_HZ. `extra` times (the contact
 * beat) are forced in wherever they land.
 */
function segmentTimes(t0, t1, ease, extra) {
  const span = t1 - t0;
  const times = [t0];
  if (span > 1e-6 && ease !== "linear" && ease !== "hold") {
    const steps = Math.max(2, Math.round(span * BAKE_HZ));
    for (let i = 1; i < steps; i++) times.push(t0 + (span * i) / steps);
  }
  for (const t of extra) {
    if (t > t0 + 1e-6 && t < t1 - 1e-6 && !times.some((x) => Math.abs(x - t) < 1e-6)) times.push(t);
  }
  return times.sort((a, b) => a - b);
}

/**
 * A pose table -> an AnimationClip.
 *
 * `keys` is `[{ t, pose: { Bone: [rx, ry, rz] degrees }, ease, hipsY }]`, in
 * time order. `ease` governs the segment that LEAVES that key. `hipsY` is an
 * absolute hip height in metres for the poses that drop the body (crouch,
 * tuck, prone) — squash is the engine's, but a crouch really is lower.
 *
 * Bones are tracked all-or-nothing: a bone any key mentions gets a full track
 * with identity wherever a key is silent, because a track that skipped keys
 * would interpolate against whatever pose came before it.
 */
export function buildClipFromKeys(THREE, name, keys, opts = {}) {
  const { duration, beat, loop = false } = opts;
  if (!keys?.length) return null;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const bones = bonesIn(sorted);
  const extra = beat !== undefined ? [beat] : [];

  // Per bone, the quaternion at each key — computed once, then slerped.
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const keyQuats = new Map();
  for (const bone of bones) {
    keyQuats.set(bone, sorted.map((k) => {
      const [rx = 0, ry = 0, rz = 0] = k.pose?.[bone] || [0, 0, 0];
      e.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
      return new THREE.Quaternion().setFromEuler(e);
    }));
  }

  // The sample grid: every segment's times, plus the final key.
  const samples = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const ease = sorted[i].ease || "linear";
    for (const t of segmentTimes(sorted[i].t, sorted[i + 1].t, ease, extra)) {
      samples.push({ t, seg: i, ease });
    }
  }
  samples.push({ t: sorted[sorted.length - 1].t, seg: sorted.length - 2, ease: "linear" });

  const tracks = [];
  for (const bone of bones) {
    const quats = keyQuats.get(bone);
    const times = [];
    const values = [];
    for (const s of samples) {
      const i = Math.max(0, s.seg);
      const a = sorted[i], b = sorted[Math.min(i + 1, sorted.length - 1)];
      const span = b.t - a.t;
      const u = span > 1e-6 ? clamp01((s.t - a.t) / span) : 1;
      const f = (EASES[s.ease] || EASES.linear)(u);
      q.copy(quats[i]).slerp(quats[Math.min(i + 1, quats.length - 1)], f);
      times.push(s.t);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }

  // Hip height, on the same eased grid — the one translation a clip may own.
  if (sorted.some((k) => k.hipsY !== undefined)) {
    const base = sorted.find((k) => k.hipsY !== undefined).hipsY;
    const times = [];
    const values = [];
    for (const s of samples) {
      const i = Math.max(0, s.seg);
      const a = sorted[i], b = sorted[Math.min(i + 1, sorted.length - 1)];
      const span = b.t - a.t;
      const u = span > 1e-6 ? clamp01((s.t - a.t) / span) : 1;
      const f = (EASES[s.ease] || EASES.linear)(u);
      const ya = a.hipsY ?? base, yb = b.hipsY ?? base;
      times.push(s.t);
      values.push(0, ya + (yb - ya) * f, 0);
    }
    tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, values));
  }

  const clip = new THREE.AnimationClip(name, duration ?? sorted[sorted.length - 1].t, tracks);
  clip.userData = { ...(clip.userData || {}), keys: sorted, loop, beat };
  return clip;
}

/**
 * An AnimationClip -> the editable table, so the workbench can edit a clip it
 * did not author (a delivered rig's own animation).
 *
 * The times are the clip's own — deduplicated across tracks, which for a
 * table-built clip gives back its extremes and for a baked .glb gives its
 * sampled frames. `maxKeys` thins a densely baked clip down to an evenly
 * spaced set that is still editable by hand; nothing is lost, because the
 * table is only ever a starting point for edits and rebuilds from these keys.
 */
export function clipToKeys(THREE, clip, maxKeys = 24) {
  if (!clip) return [];
  if (clip.userData?.keys) return clip.userData.keys.map((k) => ({ ...k, pose: { ...k.pose } }));

  const times = new Set();
  for (const track of clip.tracks) for (const t of track.times) times.add(+t.toFixed(4));
  let list = [...times].sort((a, b) => a - b);
  if (list.length > maxKeys) {
    const step = (list.length - 1) / (maxKeys - 1);
    list = Array.from({ length: maxKeys }, (_, i) => list[Math.round(i * step)]);
  }

  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const keys = list.map((t) => ({ t, pose: {}, ease: "linear" }));
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    if (parsed.propertyName !== "quaternion") continue;
    const interpolant = track.createInterpolant();
    for (const key of keys) {
      const v = interpolant.evaluate(key.t);
      q.set(v[0], v[1], v[2], v[3]);
      e.setFromQuaternion(q, "XYZ");
      key.pose[parsed.nodeName] = [e.x / DEG, e.y / DEG, e.z / DEG].map((d) => +d.toFixed(2));
    }
  }
  return keys;
}

/** The value of a per-key delta track at `t`, eased the same way the clip is.
 *  Used for edits that cannot live in the clip because a solver overwrites the
 *  bone (see the target-space edits in render3d/src/pose.js). */
export function sampleDeltaTrack(track, t) {
  if (!track?.length) return null;
  if (track.length === 1 || t <= track[0].t) return track[0].deg;
  const last = track[track.length - 1];
  if (t >= last.t) return last.deg;
  let i = 0;
  while (i < track.length - 2 && track[i + 1].t <= t) i++;
  const a = track[i], b = track[i + 1];
  const span = b.t - a.t;
  const u = span > 1e-6 ? clamp01((t - a.t) / span) : 1;
  const f = (EASES[a.ease] || EASES.ease)(u);
  return [0, 1, 2].map((k) => a.deg[k] + (b.deg[k] - a.deg[k]) * f);
}
