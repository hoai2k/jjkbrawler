// FREE LOOK, shared by both benches on this page.
//
// The clip bench turns the game camera by an offset (workbench.js setView3d);
// the reads bench turns its own bare-rig camera AND the joint overlay drawn on
// the sprite (sprite_pose.js). Different cameras, same gesture — drag to turn,
// wheel to move in, off means back to the fixed angle — and a gesture that
// behaves differently in two panes of one page is a bug you feel rather than
// see. So the state, the sensitivity, the clamps and the input handling live
// here once.
//
// What is NOT here is what to do with the angle: each bench frames its own
// camera. This module is the dial, not the lens.

/** The angle everything returns to when free look goes off: the fixed camera
 *  the game actually draws (clip bench) or the flat-on read plane (reads). */
export const REST = Object.freeze({ yaw: 0, pitch: 0, dolly: 1 });

/** Degrees per pixel of drag. Slow enough to land on an angle, fast enough to
 *  get behind the figure without letting go. */
const YAW_PER_PX = 0.35;
const PITCH_PER_PX = 0.3;
/** Short of the poles: at 90° the camera looks down its own up vector and
 *  lookAt has no answer, which reads on screen as the model flipping. */
const PITCH_LIMIT = 80;
const DOLLY_MIN = 0.3;
const DOLLY_MAX = 4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * An orbit dial. `onChange` fires whenever the angle moves, including on reset.
 *
 *   const orbit = makeOrbit(() => redraw());
 *   orbit.bind(canvas, () => orbit.on);   // drag + wheel, while the gate says so
 */
export function makeOrbit(onChange = () => {}) {
  const state = { yaw: 0, pitch: 0, dolly: 1, on: false };

  const changed = () => onChange(state);

  const api = {
    get state() { return state; },
    get on() { return state.on; },
    /** True when nothing has been turned — the pose is being seen flat-on. */
    get atRest() {
      return !state.yaw && !state.pitch && state.dolly === 1;
    },
    /** How far from the fixed angle, 0..1 — for anything that should fade as
     *  the view turns away from the one the art was drawn for. */
    get turned() {
      return Math.min(1, (Math.abs(state.yaw) + Math.abs(state.pitch)) / 90);
    },
    setOn(on) {
      state.on = !!on;
      if (!state.on) Object.assign(state, REST);
      changed();
    },
    reset() {
      Object.assign(state, REST);
      changed();
    },
    dragBy(dx, dy) {
      state.yaw += dx * YAW_PER_PX;
      state.pitch = clamp(state.pitch - dy * PITCH_PER_PX, -PITCH_LIMIT, PITCH_LIMIT);
      changed();
    },
    dollyBy(factor) {
      state.dolly = clamp(state.dolly * factor, DOLLY_MIN, DOLLY_MAX);
      changed();
    },
    /** Drag-to-turn and wheel-to-dolly on one element. `gate` decides per
     *  event whether free look owns the gesture — the reads bench hands the
     *  drag back to the joint handles when free look is off. */
    bind(el, gate = () => state.on) {
      let from = null;
      el.addEventListener("pointerdown", (ev) => {
        if (!gate(ev)) return;
        from = { x: ev.clientX, y: ev.clientY };
        el.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      el.addEventListener("pointermove", (ev) => {
        if (!from) return;
        api.dragBy(ev.clientX - from.x, ev.clientY - from.y);
        from = { x: ev.clientX, y: ev.clientY };
      });
      const drop = () => { from = null; };
      el.addEventListener("pointerup", drop);
      el.addEventListener("pointercancel", drop);
      el.addEventListener("wheel", (ev) => {
        if (!gate(ev)) return;
        ev.preventDefault();
        api.dollyBy(ev.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });
    },
  };
  return api;
}
