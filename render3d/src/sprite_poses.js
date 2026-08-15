// THE SPRITE POSES, as the schedule a 3D animation is built from.
//
// The strategy this file exists to serve: a fighter's animation is the
// INTERPOLATION BETWEEN THEIR SPRITE POSES. Not a separate 3D performance that
// happens to share a name with a sprite state — the same drawings, in the same
// order, at the same frame rate, with the model passing through each one and
// the engine filling the gaps.
//
// WHY THAT IS THE RIGHT SHAPE HERE. Every fighter already has a hand-drawn
// pose set: 36-odd drawings that ARE the game's read on how that character
// stands, strikes, guards and wins. A 3D clip authored beside them is a second
// opinion about the same question, and the roster has been paying for the
// disagreement — a model that idles differently from its own sprite reads as a
// different character, and no amount of look-dev fixes a pose that is simply
// not the drawing.
//
// It also turns an unbounded job into a bounded one. "Animate this fighter" is
// open-ended; "match these 36 drawings" is a list, reviewable one item at a
// time, which is what the workbench's pose mode is for.
//
// THE TIMING IS ALREADY AGREED. A state's sprite animation names its frames
// and an fps; render3d/src/states.js gives the same state a duration derived
// from that fps (see the note at the top of that file). So frame `i` belongs
// at `i / fps` seconds, and a two-frame idle at 2.2 fps fills exactly the
// 0.909 s the clip lasts. Nothing is stretched to fit — the two tables were
// built from the same numbers, and this is where that finally pays.

import { STATES, CLIP_STATES } from "./states.js";
import { resolvedAnim } from "../../sprites/src/sprites.js";

/**
 * When each of a state's sprite frames is drawn, in clip seconds.
 *
 * Returns [] for a state with no resolvable art — the caller keeps whatever
 * the delivered clip does rather than inventing a schedule.
 */
export function poseSchedule(charKey, state) {
  // The state's OWN drawings and its OWN duration — never resolved through
  // clipNameFor. A state that borrows another's clip still has its own art
  // (a dash attack draws `attack_dash` while playing the light strike's
  // animation), and asking for the clip's name would hand back the wrong
  // fighter's-worth of poses.
  const spec = STATES[state];
  const anim = resolvedAnim(charKey, state);
  const frames = anim?.frames?.filter(Boolean) || [];
  if (!frames.length || !anim.fps) return [];
  const dur = spec?.duration ?? frames.length / anim.fps;
  const times = frames.map((_, i) => Math.min(+(i / anim.fps).toFixed(4), dur));
  // The CONTACT frame of an attack: the last frame scheduled at or before the
  // beat (every frame, when the wind-up is the whole pre-beat sheet). The
  // segments either side of it travel differently — see `ease` below.
  let contactT = null;
  if (spec?.beat !== undefined) {
    contactT = times[0];
    for (const t of times) if (t <= spec.beat + 1e-4) contactT = t;
  }
  return frames.map((frame, i) => ({
    frame,
    i,
    // Clamped into the clip: a state whose art outruns its duration (a
    // fallback pose set playing at the wrong fps) would otherwise schedule
    // keys past the end, where nothing samples them.
    t: times[i],
    fps: anim.fps,
    // How the pose travels OUT of this frame. A sprite cuts; a model has to
    // travel, and how it travels is the one animation decision the drawings
    // cannot make — so it is a per-pose setting with a sane default rather
    // than a constant.
    //
    // Attacks are two different motions either side of the contact. INTO the
    // contact frame is the strike: it accelerates out of the coil ("in" —
    // slow leaving the wind-up, explosive arriving), which is what gives a
    // punch anticipation; the old constant "snap" front-loaded the travel and
    // showed the extended arm for most of the wind-up window instead. OUT of
    // the contact frame is follow-through: fast off the hit, settling ("out").
    // Everything that is not an attack just eases.
    ease: contactT === null ? "ease" : (times[i] < contactT ? "in" : "out"),
  }));
}

/**
 * Every pose the game can draw this fighter in, once each, in the order the
 * state list gives them — the catalogue the pose workbench walks.
 *
 * A drawing shared by several states (one `attack_heavy` standing in for both
 * heavies, `hurt` covering `prone` until it is drawn) appears ONCE, under the
 * first state that draws it, with the rest listed beside it. Posing it twice
 * is posing it twice; there is one drawing, so there is one pose.
 */
export function poseCatalogue(charKey) {
  const seen = new Map();
  for (const state of CLIP_STATES) {
    for (const entry of poseSchedule(charKey, state)) {
      const held = seen.get(entry.frame);
      if (held) { held.alsoIn.push(state); continue; }
      seen.set(entry.frame, { ...entry, state, alsoIn: [] });
    }
  }
  return [...seen.values()];
}

/** Where `frame` sits for this fighter — its state, its time, its siblings.
 *  Null when nothing draws it. */
export function poseEntry(charKey, frame) {
  return poseCatalogue(charKey).find((p) => p.frame === frame) || null;
}
