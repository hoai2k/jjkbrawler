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
/**
 * The ULTIMATES that throw a real projectile, and the config they throw it with.
 *
 * A special declares its shot in the kit, so `p` is the whole answer. A
 * director does not: Gojo's Hollow Purple charges for 0.55s and then calls
 * spawnProjectile with numbers written into src/ultimates.js — `speed: 860`,
 * `ox: 90`, `oy: -96`, a radius of half the move's declared width. The kit says
 * `width` and `duration`; the handler says everything else.
 *
 * So the handler's half is recorded here, the same way the shared registry
 * records each spawn site's launch point, and for the same reason: a drawing
 * the game throws should be previewable, and Hollow Purple was showing a spawn
 * crosshair and a travel arrow with no way to see the shot they describe.
 */
const ULT_SHOTS = {
  beam: (p) => ({ ...p, speed: 860, ox: 79, oy: -78, r: p.width / 2, dur: p.duration }),
};

/**
 * The ULTIMATES that drop something onto a target instead of throwing it.
 *
 * Jogo's Maximum: Meteor never calls spawnProjectile — its director pushes an
 * entity that paints the drawing falling from `y: -160` to the floor over
 * `fallTime`, above the OPPONENT's x (src/ultimates.js, `meteor`). There is no
 * muzzle and no `ox`/`oy`, so the shot machinery had nothing to offer it and
 * the drawing had no Play button at all — leaving the two questions it most
 * needs answered, how big and at what angle, answerable only in a real match.
 *
 * `delay` is the beat before it appears, `from` the height it starts at, and
 * `to` its offset above the floor at impact: the same three numbers the
 * director uses, kept here so the fall reads at the speed the game falls it.
 */
const ULT_DROPS = {
  meteor: (p) => ({ ...p, delay: 0.5, from: -160, to: -40, fall: p.fallTime ?? 1.1 }),
};

/**
 * @param spriteKey  the drawing to find an action for.
 * @param preferChar the fighter whose effects list this was opened from. A
 *   drawing more than one kit fires has no single answer to "who fires it", and
 *   the walk's first hit is the wrong one whenever you are standing in somebody
 *   else's list — the same reason `sharedOwner` prefers the context character.
 *   Aligning art to a body is worthless against the wrong body.
 */
export function firingUse(spriteKey, preferChar) {
  const order = preferChar && CHARACTERS[preferChar]
    ? [preferChar, ...CHARACTER_KEYS.filter((k) => k !== preferChar)]
    : CHARACTER_KEYS;
  for (const charKey of order) {
    const c = CHARACTERS[charKey];
    const ult = c?.ultimate;
    const drop = ULT_DROPS[ult?.type];
    if (drop && ult?.p?.sprite === spriteKey) {
      return {
        charKey, slot: "ult", spec: ult, p: drop(ult.p), state: "ult", mode: "drop",
        name: ult.name || spriteKey,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
    const shot = ULT_SHOTS[ult?.type];
    if (shot && ult?.p?.sprite === spriteKey) {
      const p = shot(ult.p);
      const solved = spawnOffset(charKey, "ult", p.ox, p.oy);
      return {
        charKey, slot: "ult", spec: ult, p, state: "ult",
        name: ult.name || spriteKey,
        ox: p.ox, oy: p.oy, solved,
        muzzleScale: bodyMetrics(charKey).height / HEIGHT_BASE_PX,
      };
    }
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
  // Somebody to aim at. A shot with `homing` bends toward whoever it is chasing
  // and a meteor falls on their head, so an empty stage was showing neither:
  // the ember arc looked like a plain lob because there was nothing for it to
  // lean toward, and the meteor had no x to fall at. Far enough away that the
  // bend is visible over the shot's own flight time.
  const ENEMY_X = 640;
  /** Who stands there: anybody but the fighter casting. */
  const enemyFor = (charKey) => (charKey === "yuji" ? "megumi" : "yuji");
  /** What the shot chases, in the shape combat.js's homing reads. */
  const targetPoint = () => ({ x: ENEMY_X, y: GROUND });

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
    const home = { x0, y0, source: m.source };
    // A shot that chases nobody has a closed form; a shot with `homing` does
    // not — combat.js bends it a little every frame toward the target, so the
    // only honest way to draw the path is to walk it the way the game walks it
    // (src/combat.js, the homing block). Fixed step so the same `age` always
    // lands in the same place however the browser paces its frames.
    let x = x0, y = y0, vx = dir * (use.p.speed || 500), vy = use.p.vy || 0;
    if (!use.p.homing) {
      return { ...home, x: x0 + vx * age, y: y0 + vy * age + 0.5 * g * age * age,
               vx, vy: vy + g * age };
    }
    const target = targetPoint();
    const STEP = 1 / 120;
    for (let t = 0; t < age; t += STEP) {
      const dt = Math.min(STEP, age - t);
      vx += Math.sign(target.x - x) * use.p.homing * dt * 8;
      vy += Math.max(-220, Math.min(220, (target.y - 60) - y)) * dt * 3;
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
    }
    return { ...home, x, y, vx, vy };
  }

  /** Where a DROPPED drawing is, `age` seconds in: straight down onto the
   *  target's head, at the speed src/ultimates.js falls it. */
  function dropAt(age) {
    const p = use.p;
    const prog = Math.max(0, (age - p.delay) / p.fall);
    const y0 = GROUND + p.from;
    const y1 = GROUND + p.to;
    return {
      x0: ENEMY_X, y0,
      x: ENEMY_X, y: y0 + Math.min(1, prog) * (y1 - y0),
      vx: 0, vy: (y1 - y0) / p.fall, visible: age >= p.delay,
    };
  }

  /** The point the drawing is measured from, whichever way this action puts it
   *  on the stage: a shot's muzzle, or the top of a drop's fall. */
  const originAt = (adj) => (use.mode === "drop" ? dropAt(use.p.delay) : shotAt(0, adj));

  /** The projectile, painted exactly as render.js paints it. */
  function drawShot(sprite, pos, adj, age) {
    const h = (use.p.spriteH || use.p.r * 3) * (adj.scale || 1);
    const w = sprite.width * h / sprite.height;
    ctx.save();
    // The same ramp drawProjectiles applies (sharedFadeIn), read live so the
    // slider under the canvas shows up on the next loop of the same playthrough
    // — which is the only way to judge it, since a few frames of fade is a
    // thing you see in motion or not at all.
    if (adj.fadeIn) ctx.globalAlpha = Math.min(1, age / adj.fadeIn);
    ctx.translate(pos.x, pos.y);
    // A dropped drawing is painted upright — its director never mirrors it and
    // never turns it into its fall, so the only tilt it has is the standing
    // one, and previewing it under the projectile's flight rotate would show a
    // meteor lying on its side that the game draws nose-down.
    if (use.mode !== "drop") {
      const flip = pos.vx > 0 ? -1 : 1;
      if (use.p.vy || use.p.gravity || use.p.homing) ctx.rotate(Math.atan2(-flip * pos.vy, -flip * pos.vx));
      ctx.scale(flip, 1);
    }
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
    const dur = use.mode === "drop" ? use.p.delay + use.p.fall + 0.3 : (use.p.dur || 0.9);
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

    // The target, standing where the shot is aimed. Drawn for every action so
    // the flight has a scale to be judged against, and REQUIRED by the two that
    // are about a target: a homing shot bends toward this body and a meteor
    // falls on it. Dimmed, because it is scenery for this question.
    ctx.save();
    ctx.globalAlpha = 0.75;
    const ek = enemyFor(use.charKey);
    const ef = currentFrame(ek, "idle", t);
    await loadFrame(ek, ef).catch(() => {});
    drawCharFrame(ctx, ek, ef, ENEMY_X, GROUND,
      { scale: CHARACTERS[ek]?.scale, facing: -1 });
    ctx.restore();

    const pos = use.mode === "drop" ? dropAt(t) : shotAt(t, adj);
    const sprite = getImage(use.spriteKey);
    if (sprite && t <= dur && pos.visible !== false) drawShot(sprite, pos, adj, t);

    // The two points, always visible: the one the game spawns from and the one
    // the drawing is centred on after the nudge. A drop has no muzzle to place
    // — the director picks the target's x, and nothing about that is the
    // drawing's to move — so only the drawing marker is offered.
    const origin = use.mode === "drop" ? dropAt(use.p.delay) : shotAt(0, adj);
    if (use.mode !== "drop") marker(origin.x0, origin.y0, "#9fd39f", "spawn", false);
    marker(origin.x0 + (adj.dx || 0), origin.y0 + (adj.dy || 0), "#f0b45a", "drawing", true);

    ctx.fillStyle = "#8b96b3";
    ctx.font = "12px ui-monospace, monospace";
    const nudge = `drawing dx ${(adj.dx || 0).toFixed(1)}, dy ${(adj.dy || 0).toFixed(1)}`;
    if (use.mode === "drop") {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · falls onto the target in ${use.p.fall}s`, 14, 22);
      ctx.fillText(`no muzzle — the drop picks the target's x   ·   ${nudge}`, 14, 40);
    } else {
      ctx.fillText(`${use.name} — ${use.charKey} · ${use.state} · ${use.p.speed || 0}px/s for ${dur}s`
        + (use.p.homing ? ` · homes at ${use.p.homing}` : ""), 14, 22);
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
        + `   ·   ${SOURCE[pos.source] || pos.source}   ·   ${nudge}`, 14, 40);
    }

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
    const o = originAt(adj);
    const dPt = { x: o.x0 + (adj.dx || 0), y: o.y0 + (adj.dy || 0) };
    // The drawing marker wins a tie: it is the one that moves most often, and
    // it sits on top of the spawn point whenever the nudge is zero.
    if (Math.hypot(pt.x - dPt.x, pt.y - dPt.y) < 18) drag = "drawing";
    else if (use.mode !== "drop" && Math.hypot(pt.x - o.x0, pt.y - o.y0) < 18) drag = "spawn";
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
      const o = originAt(adj);
      write({ dx: +(pt.x - o.x0).toFixed(1), dy: +(pt.y - o.y0).toFixed(1) }, first);
    }
  });
  const stopDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  return {
    /** Start playing `spriteKey`; returns false when no move fires it. */
    open(spriteKey, preferChar) {
      const found = firingUse(spriteKey, preferChar);
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
