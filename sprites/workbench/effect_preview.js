// "Play it" — the shared effect art, in the action that spawns it.
//
// The Other Sprites panel can say a great deal about a drawing (what draws it,
// how tall, which point it is painted around) and still leave the only question
// that matters unanswered: does it LOOK right when the move goes off. A lance
// of blood is a picture until you see it leave the finger.
//
// So this plays the move. The fighter runs their real sprite animation for the
// state the special uses, the projectile spawns where the game would spawn it,
// flies at the speed the kit declares, and is painted through the same
// arithmetic render.js paints it with — the workbench's own unsaved nudge, size
// and rotation included. What you are looking at is the change you just made.
//
// TWO POINTS, AND THE WHOLE REASON THIS EXISTS
//
//   the SPAWN POINT   where the game creates the projectile: the fighter's
//                     position plus the move's `ox`/`oy`. It is what the shot
//                     collides from, and it belongs to the KIT.
//   the DRAWING       painted around that point, moved by `dx`/`dy`, which is
//                     what the workbench edits.
//
// Aligning art to a point is one job; putting the point on the character's
// finger is a different one, and until now only the first was reachable. Both
// are draggable here, they are drawn in different colours, and they export
// separately — `dx`/`dy` as the drawing's adjustment, `spawnOx`/`spawnOy` as a
// note against the move, because the kit is where that number has to land.

import { CHARACTERS, CHARACTER_KEYS } from "../../src/characters.js";
import { STATES, clipTime } from "../../render3d/src/states.js";
import { drawCharFrame, currentFrame } from "../src/sprites.js";
import { loadFrame, getImage } from "../../src/assets.js";
import { bodyMetrics } from "../../src/silhouette.js";
import { spawnOffset, REFERENCE_MUZZLE } from "../../src/muzzle.js";
import { HEIGHT_BASE_PX } from "../../src/config_tuning.js";

/** The animation state each special slot plays (src/specials.js). */
const SLOT_STATE = { neutral: "specialNeutral", side: "specialSide", down: "specialDown" };
/** spawnProjectile's defaults, for a move that names no muzzle of its own. */
const DEFAULT_OX = 70;
const DEFAULT_OY = -86;

/**
 * Who fires this drawing, and with what. Walks the kits the way the shared
 * registry does, but keeps what a PLAYBACK needs and the registry throws away:
 * the character key, the animation state, and the projectile config itself.
 *
 * Returns null for art no kit fires — a stage hazard, a domain backdrop, a
 * creature — which is the honest answer: there is no "action" to play.
 */
export function firingUse(spriteKey) {
  for (const charKey of CHARACTER_KEYS) {
    const c = CHARACTERS[charKey];
    for (const [slot, spec] of Object.entries(c?.specials || {})) {
      const p = spec?.p;
      // `sprite` names the one drawing a move throws; `spritePool` names four
      // it picks between, one per shot — Geto's volley throws a random cursed
      // spirit. Both are thrown by the same handler from the same muzzle, so
      // both have an action to play, and only the first was being offered one:
      // all four curses had the Play button greyed out with no way to see how
      // they are used. `sprites` stays out — that is a creature's stand-in
      // stack, and a creature is not fired.
      const inPool = Array.isArray(p?.spritePool) && p.spritePool.includes(spriteKey);
      if (!p || (p.sprite !== spriteKey && !inPool)) continue;
      if (spec.type && spec.type !== "projectile") continue;
      // The point the game will really spawn from: this fighter's hand in the
      // pose this move plays, plus whatever the move asks for beyond the
      // reference (src/muzzle.js). `source` says whether anybody has looked at
      // that hand, which the caption repeats — a muzzle nobody has placed is a
      // roster-wide guess and worth knowing about before art is aligned to it.
      const state = SLOT_STATE[slot] || "specialNeutral";
      const solved = spawnOffset(charKey, state, p.ox, p.oy);
      return {
        charKey, slot, spec, p, state,
        name: spec.name || p.label || spriteKey,
        ox: Number.isFinite(p.ox) ? p.ox : DEFAULT_OX,
        oy: Number.isFinite(p.oy) ? p.oy : DEFAULT_OY,
        solved,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
  }
  return null;
}

/**
 * The preview itself: a fighter, a floor, and the shot leaving them on a loop.
 *
 * `read` is asked for the drawing's live adjustment every frame rather than
 * once, so dragging a marker or turning a dial shows up in the next frame of
 * the same playthrough — the point of previewing here rather than in the game.
 */
export function makeEffectPreview({ canvas, read, write, onClose }) {
  const ctx = canvas.getContext("2d");
  const GROUND = canvas.height - 70;
  const FIGHTER_X = 190;

  let use = null;

  /** The spawn point in GAME px from the fighter's feet, for kit offsets `ox`
   *  and `oy` — the fighter's own hand plus the move's displacement from the
   *  reference. Exactly what combat.js resolves, so the shot is drawn where the
   *  game will make it. */
  const solve = (ox, oy) => spawnOffset(use.charKey, use.state, ox, oy);

  /** A dragged canvas point back into the KIT units the kit has to hold: undo
   *  the hand and the body scale that `solve` applied. Without this a muzzle
   *  tuned until it looked right landed wrong by the fighter's own scale, and
   *  once a hand is verified the raw canvas number stops meaning anything at
   *  all — the kit's job is to say how far from the hand, not where. */
  function toKit(pt) {
    const home = solve(REFERENCE_MUZZLE.x, REFERENCE_MUZZLE.y);   // the hand itself
    const k = use.muzzleScale || 1;
    return {
      spawnOx: Math.round((pt.x - FIGHTER_X - home.x) / k + REFERENCE_MUZZLE.x),
      spawnOy: Math.round((pt.y - GROUND - home.y) / k + REFERENCE_MUZZLE.y),
    };
  }
  let raf = 0;
  let t = 0;
  let running = false;
  let drag = null;
  let grabbed = false;
  let lastTick = 0;

  /** Where the shot is, in canvas pixels, `age` seconds after it left.
   *
   *  The muzzle is resolved rather than read off the kit: the fighter's own
   *  hand — verified, measured off their rig, or the reference scaled onto
   *  their height — with the move's offset on top. Drawing the raw kit number
   *  put the shot a few pixels off the hand it leaves, and meant the number
   *  being dragged here was not the number the kit wants. */
  function shotAt(age, adj) {
    const dir = 1; // the preview always fires to the right
    const m = solve(adj.spawnOx ?? use.ox, adj.spawnOy ?? use.oy);
    const x0 = FIGHTER_X + dir * m.x;
    const y0 = GROUND + m.y;
    const g = use.p.gravity || 0;
    return {
      x0, y0, source: m.source,
      x: x0 + dir * (use.p.speed || 500) * age,
      y: y0 + (use.p.vy || 0) * age + 0.5 * g * age * age,
      vx: dir * (use.p.speed || 500),
      vy: (use.p.vy || 0) + g * age,
    };
  }

  /** The projectile, painted exactly as render.js paints it. */
  function drawShot(sprite, pos, adj) {
    const h = (use.p.spriteH || use.p.r * 3) * (adj.scale || 1);
    const w = sprite.width * h / sprite.height;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    const flip = pos.vx > 0 ? -1 : 1;
    if (use.p.vy || use.p.gravity) ctx.rotate(Math.atan2(-flip * pos.vy, -flip * pos.vx));
    ctx.scale(flip, 1);
    if (adj.rot) ctx.rotate(adj.rot);
    ctx.shadowColor = use.p.color || "#8fd3ff";
    ctx.shadowBlur = 12;
    ctx.drawImage(sprite, -w / 2 + (adj.dx || 0), -h / 2 + (adj.dy || 0), w, h);
    ctx.restore();
  }

  function marker(x, y, colour, label, filled) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    filled ? ctx.fill() : ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 13, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 13, y);
    ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 13);
    ctx.stroke();
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(label, x + 16, y - 8);
    ctx.restore();
  }

  async function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastTick) / 1000 || 0);
    lastTick = now;
    const dur = use.p.dur || 0.9;
    const cycle = Math.max(STATES[use.state]?.duration || 0.5, dur) + 0.35;
    t = (t + dt) % cycle;

    const adj = read();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f1424";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#2c3654";
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(canvas.width, GROUND);
    ctx.stroke();

    // The fighter, on their own animation for the state this move plays.
    const animT = Math.min(t, STATES[use.state]?.duration ?? t);
    const cf = currentFrame(use.charKey, use.state, animT);
    await loadFrame(use.charKey, cf).catch(() => {});
    drawCharFrame(ctx, use.charKey, cf, FIGHTER_X, GROUND,
      { scale: CHARACTERS[use.charKey]?.scale, facing: 1 });

    const pos = shotAt(t, adj);
    const sprite = getImage(use.spriteKey);
    if (sprite && t <= dur) drawShot(sprite, pos, adj);

    // The two points, always visible: the one the game spawns from and the one
    // the drawing is centred on after the nudge.
    const origin = shotAt(0, adj);
    marker(origin.x0, origin.y0, "#9fd39f", "spawn", false);
    marker(origin.x0 + (adj.dx || 0), origin.y0 + (adj.dy || 0), "#f0b45a", "drawing", true);

    ctx.fillStyle = "#8b96b3";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · ${use.p.speed || 0}px/s for ${dur}s`, 14, 22);
    // Kit units, which is what these numbers have to be to be worth writing
    // down — the scale that turns them into the pixels above is noted beside.
    const kitOx = Math.round(adj.spawnOx ?? use.ox);
    const kitOy = Math.round(adj.spawnOy ?? use.oy);
    const SOURCE = {
      human: "hand-placed muzzle",
      model: "muzzle measured off the rig",
      derived: "muzzle unplaced — reference scaled",
    };
    ctx.fillText(`spawn ox ${kitOx}, oy ${kitOy} (kit)`
      + `   ·   ${SOURCE[pos.source] || pos.source}`
      + `   ·   drawing dx ${(adj.dx || 0).toFixed(1)}, dy ${(adj.dy || 0).toFixed(1)}`, 14, 40);

    raf = requestAnimationFrame(frame);
  }

  function pointFor(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * canvas.width,
             y: ((ev.clientY - r.top) / r.height) * canvas.height };
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (!use) return;
    const pt = pointFor(ev);
    const adj = read();
    const o = shotAt(0, adj);
    const dPt = { x: o.x0 + (adj.dx || 0), y: o.y0 + (adj.dy || 0) };
    // The drawing marker wins a tie: it is the one that moves most often, and
    // it sits on top of the spawn point whenever the nudge is zero.
    if (Math.hypot(pt.x - dPt.x, pt.y - dPt.y) < 18) drag = "drawing";
    else if (Math.hypot(pt.x - o.x0, pt.y - o.y0) < 18) drag = "spawn";
    else return;
    grabbed = false;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag || !use) return;
    const pt = pointFor(ev);
    const adj = read();
    const first = !grabbed;
    grabbed = true;
    if (drag === "spawn") {
      write(toKit(pt), first);   // kit units, because the kit is where it lands
    } else {
      const o = shotAt(0, adj);
      write({ dx: +(pt.x - o.x0).toFixed(1), dy: +(pt.y - o.y0).toFixed(1) }, first);
    }
  });
  const stopDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  return {
    /** Start playing `spriteKey`; returns false when no move fires it. */
    open(spriteKey) {
      const found = firingUse(spriteKey);
      if (!found) return false;
      use = { ...found, spriteKey };
      t = 0;
      lastTick = performance.now();
      running = true;
      raf = requestAnimationFrame(frame);
      return true;
    },
    close() {
      running = false;
      cancelAnimationFrame(raf);
      onClose?.();
    },
    get use() { return use; },
  };
}
