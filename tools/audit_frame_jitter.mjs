// HOW FAR DOES A FIGHTER JUMP WHEN THE DRAWING CHANGES?
//
//   node tools/audit_frame_jitter.mjs            # the whole roster
//   node tools/audit_frame_jitter.mjs --check    # fail on a held cycle that pops
//   node tools/audit_frame_jitter.mjs --char maki --state run
//   node tools/audit_frame_jitter.mjs --worst 20
//
// A sprite animation is a series of cuts, and every frame carries its own
// placement: `renderScale` sizes it, `bodyBottom` puts its foot line on the
// floor, `ox` centres it, `rotationDeg` tilts it. So the instant the drawing
// changes, the fighter can change STATURE and POSITION as well as pose — and a
// cycle whose frames disagree about those does not read as animation, it reads
// as a fighter who will not hold still.
//
// This measures that step the way the renderer applies it, which is the whole
// point of the file: the placement in the manifest is not what a player sees.
//
//   GROUNDED poses hang from the foot line, so the head sits
//   `(bodyBottom - oy - bodyTop) * renderScale * scale` above the contact and a
//   difference between frames moves the whole body.
//
//   AIRBORNE poses do not. `render.js holdComY` re-anchors them to their centre
//   of mass — there is nothing under the feet to stand on — so the foot line's
//   disagreement is absorbed and what survives is the head's height above the
//   COM. The absorption is capped at COM_HOLD_MAX_FRAC of body height, so a
//   frame far enough out still leaks the remainder, and that leak is what gets
//   reported for those states rather than the raw foot-line difference.
//
// WHAT IS A FAULT AND WHAT IS THE ANIMATION
//
// Not every step is wrong. A run has a real stride bob — the body drops onto
// the reaching foot and rises over the passing one — and an attack genuinely
// changes shape between its wind-up and its blow. Two things separate the
// animation from the artefact, and both are reported:
//
//   HELD cycles (idle, crouch, walk, teeter, shield…) are one pose breathing.
//   The fighter is not travelling and not changing stature, so any step in
//   these is noise by definition. `--check` fails on them.
//
//   SYMMETRY. A stride's two halves are the same motion on opposite legs, so
//   `run_reach_a` and `run_reach_b` should sit at the same height and so should
//   the two passes. The difference between the halves is a LIMP: it cannot be
//   anything the animation is trying to say, because the animation says the
//   same thing twice.
//
// Attack cycles are reported and never failed: whether a 30% change of stature
// between a wind-up and a strike is the drawing or a mis-sized frame is a
// judgement, and this can only say which ones are worth looking at.
//
// WHAT THIS MEASURES THAT THE FADES CANNOT
//
// `src/render.js` softens a cut two ways, and neither of them is this:
//
//   the shipped cross-fade   ghosts the outgoing drawing for 0.08s on a STATE
//                            change. Within-state steps are left alone on
//                            purpose — the snap of limited animation is the
//                            style.
//                            `?smooth=holds` briefly extended that fade to
//                            within-state steps and was removed: on two
//                            drawings of one stance it bought a dissolve
//                            nobody wanted and cost an opacity dip that read
//                            as a flicker. Which leaves this measurement as
//                            the only thing watching those steps.
//   `?smooth=com`            lines the two drawings of a fade up by their
//                            centre of mass and slides it between them, capped
//                            at XFADE_COM_MAX_FRAC. It works on the X AXIS.
//
// So a fade can hide a step and a slide can close a horizontal seam, but
// neither stops the fighter CHANGING STATURE between two drawings: a dissolve
// between a body 7% taller and a body 7% shorter is a smooth dissolve between
// two differently sized men. That vertical step is what this measures, and it
// is the one thing better art placement fixes and better compositing does not.
// The two are complements — `tools/debug_com_fade.mjs` measures the seam a
// fade has to cover, this measures how much of it should not have been there.
//
// The `fade` column says which states have a draw-time softener available at
// all, so a pop can be read as "this needs the art fixed" rather than "this is
// already handled".
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { CHARACTER_KEYS, SPRITE_ACTORS, CHARACTERS } =
  await import(new URL("src/characters.js", ROOT));
const { resolvedAnim, animsOf, frameFootY } =
  await import(new URL("sprites/src/sprites.js", ROOT));
const { loadCoreAssets, frameMeta } = await import(new URL("src/assets.js", ROOT));
const { applyAllHeightScales } = await import(new URL("src/heights.js", ROOT));
const { bodyMetrics } = await import(new URL("src/silhouette.js", ROOT));
const { comFrac } = await import(new URL("src/body_points.js", ROOT));
const { COM_HOLD_MAX_FRAC } = await import(new URL("src/config_tuning.js", ROOT));
await loadCoreAssets();
applyAllHeightScales();

const CELL_W = 313.5;

// States that hold one pose. Nothing in them may move the body: a crouch pair
// is "the same held crouch, breathing" (sprites/docs/pose-brief.md) and a walk
// contact pair is a stride the procedural bob already supplies. These are the
// ones `--check` is allowed to fail.
const HELD = new Set(["idle", "crouch", "walk", "teeter", "shield", "charge",
                      "dizzy", "grabHold", "win"]);

// States the renderer hangs from the centre of mass instead of the foot line.
// Mirrors the gate in render.js: airborne, and not on a ledge.
const AIRBORNE = new Set(["jump", "fall", "airLight", "dodge_air"]);

// How much of a held cycle's body height may move between two frames before it
// is a pop rather than a breath. A fighter is ~149px, so this is about 2px —
// idle already sits at 0.5px across the roster, which is what "breathing" costs.
const HELD_TOLERANCE = 0.015;

// The rate below which a held loop is slow enough that its step is a flick
// rather than a beat of animation. Nothing in the renderer reads this any more
// — the fade that used to is gone — so it is a reporting threshold only: the
// column marks the states where a step is worth a second drawing.
const SLOW_HOLD_FPS = 4;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const onlyChar = value("--char", null);
const onlyState = value("--state", null);
const worstN = Number(value("--worst", 12));

/** Everything the renderer needs from a frame, in world px above the contact. */
function placed(char, key, state, scale, H) {
  const m = frameMeta(char, key);
  if (!m || m.bodyTop === undefined) return null;
  const rs = (m.renderScale || 1) * scale;
  const foot = frameFootY(m);
  const oy = m.oy ?? 0;
  const com = m.anchors?.com || null;
  // Foot-line placement: what a grounded pose gets.
  const head = (foot - oy - m.bodyTop) * rs;
  const out = {
    key, head,
    x: ((m.ox ?? 0) + (com ? com[0] : CELL_W / 2) - CELL_W / 2) * rs * (m.faceLeft ? -1 : 1),
    rot: m.rotationDeg ?? 0,
  };
  if (!AIRBORNE.has(state) || !com) return out;
  // COM placement: what an airborne pose gets instead. The renderer shifts the
  // drawing so the com lands at the height the sim believes the mass is at,
  // and clamps that shift — so the head ends up its own distance above the com,
  // plus whatever the clamp refused to absorb.
  const comAbove = (foot - oy - com[1]) * rs;
  const want = comAbove - H * comFrac(char);
  const cap = H * COM_HOLD_MAX_FRAC;
  const leak = want - Math.max(-cap, Math.min(cap, want));
  out.head = (com[1] - m.bodyTop) * rs + leak;
  out.anchored = "com";
  return out;
}

const rows = [];
for (const char of [...CHARACTER_KEYS, ...Object.keys(SPRITE_ACTORS)]) {
  if (onlyChar && char !== onlyChar) continue;
  const scale = CHARACTERS[char]?.scale;
  if (!scale) continue;
  const H = bodyMetrics(char).height;
  for (const state of Object.keys(animsOf(char) || {})) {
    if (onlyState && state !== onlyState) continue;
    const anim = resolvedAnim(char, state);
    if (!anim || anim.frames.length < 2) continue;
    const pts = anim.frames.map((k) => placed(char, k, state, scale, H));
    if (pts.some((p) => !p)) continue;

    const step = (f) => {
      let worst = 0, at = "";
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        // A one-shot anim does not wrap: its last frame holds.
        if (!anim.loop && i === pts.length - 1) continue;
        const d = Math.abs(f(b) - f(a));
        if (d > worst) { worst = d; at = `${a.key}->${b.key}`; }
      }
      return { worst, at };
    };
    const head = step((p) => p.head);
    // The limp: the two halves of a cycle are the same motion on opposite legs,
    // so slot i and slot i + n/2 should agree. Only meaningful on an even cycle
    // of four or more — a two-frame cycle IS its two halves.
    let limp = 0, limpAt = "";
    if (pts.length >= 4 && pts.length % 2 === 0) {
      const half = pts.length / 2;
      for (let i = 0; i < half; i++) {
        const d = Math.abs(pts[i + half].head - pts[i].head);
        if (d > limp) { limp = d; limpAt = `${pts[i].key} vs ${pts[i + half].key}`; }
      }
    }
    rows.push({
      char, state, fps: anim.fps, n: pts.length, loop: !!anim.loop,
      held: HELD.has(state), airborne: AIRBORNE.has(state),
      headStep: head.worst, headAt: head.at,
      xStep: step((p) => p.x).worst, xAt: step((p) => p.x).at,
      rotStep: step((p) => p.rot).worst,
      limp, limpAt, H,
    });
  }
}

const pct = (r, v) => `${((v / r.H) * 100).toFixed(1)}%`;
const byState = new Map();
for (const r of rows) {
  if (!byState.has(r.state)) byState.set(r.state, []);
  byState.get(r.state).push(r);
}
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

if (!flag("--check")) {
  console.log("Step between consecutive frames, as the renderer places them.");
  console.log("Percentages are of the fighter's own body height.\n");
  console.log("state           n   fps  kind  hold    head step   worst    sideways    limp");
  const order = [...byState.entries()]
    .sort((a, b) => median(b[1].map((r) => r.headStep)) - median(a[1].map((r) => r.headStep)));
  for (const [state, v] of order) {
    const kind = v[0].held ? "held" : v[0].airborne ? "air " : "act ";
    // Slow enough that the step reads as a flick. Every faster one was
    // authored to snap and does.
    const fade = v[0].fps <= SLOW_HOLD_FPS ? "slow " : "—    ";
    const h = median(v.map((r) => r.headStep));
    const worst = Math.max(...v.map((r) => r.headStep));
    const x = median(v.map((r) => r.xStep));
    const lp = median(v.map((r) => r.limp));
    console.log(`${state.padEnd(14)}${String(v[0].n).padStart(2)}${v[0].fps.toFixed(0).padStart(6)}`
      + `  ${kind}  ${fade}${pct(v[0], h).padStart(9)}${pct(v[0], worst).padStart(8)}`
      + `${pct(v[0], x).padStart(12)}${(lp ? pct(v[0], lp) : "—").padStart(8)}`);
  }

  console.log("\nWorst individual steps:");
  for (const r of [...rows].sort((a, b) => b.headStep - a.headStep).slice(0, worstN)) {
    console.log(`  ${pct(r, r.headStep).padStart(6)}  ${r.char.padEnd(11)} ${r.state.padEnd(13)}`
      + ` ${r.headAt}${r.airborne ? "   (com-anchored)" : ""}`);
  }
  const limps = rows.filter((r) => r.limp > 0).sort((a, b) => b.limp - a.limp);
  if (limps.length) {
    console.log("\nWorst limps — one half of the cycle sits lower than the other:");
    for (const r of limps.slice(0, worstN)) {
      console.log(`  ${pct(r, r.limp).padStart(6)}  ${r.char.padEnd(11)} ${r.state.padEnd(8)} ${r.limpAt}`);
    }
  }
}

const failures = rows.filter((r) => r.held && r.headStep > r.H * HELD_TOLERANCE);
if (flag("--check")) {
  if (!failures.length) {
    console.log(`held cycles ok — ${rows.filter((r) => r.held).length} of them, `
      + `none moving the body more than ${(HELD_TOLERANCE * 100).toFixed(1)}% of its height`);
  } else {
    console.log(`${failures.length} held cycle(s) move the fighter's body between frames.`);
    console.log("A held pose is one drawing breathing; a step here is a pop, not animation.\n");
    for (const r of failures.sort((a, b) => b.headStep - a.headStep)) {
      console.log(`  ${pct(r, r.headStep).padStart(6)}  ${r.char.padEnd(11)} ${r.state.padEnd(8)} ${r.headAt}`);
    }
    console.log("\nFix by making the frames of one held pose agree on how tall the figure");
    console.log("is drawn: tools/smooth_cycles.py --dry-run says what it would change.");
  }
}
process.exit(flag("--check") && failures.length ? 1 : 0);
