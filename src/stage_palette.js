// THE SLAB TAKES THE ROOM'S LIGHT.
//
// Every board already declares its ambiance once, as `tint` in stages.js — the
// wash the backdrop is painted through. The platforms did not read it: one
// blue-grey gradient with a gold lip was drawn on all 20 boards, so the same
// cold slab sat in Lantern Corridor's amber and in Neon Split's magenta as if
// it had been carried in from another game.
//
// This derives the slab's colours from that same tint, so the boards stay in
// sync with themselves: retint a stage and its platforms follow. What is kept
// from the shipped look is its STRUCTURE — how dark each stop is, and roughly
// how saturated. Only the hue is a board's to decide.
//
// TWO ANCHORS, because the slab and the light on it are different things.
//
// THE FILL takes the room's hue. The shipped gradient's three stops are a cool
// body with a warm edge — a hue spread across the slab, which is what stops it
// reading as a flat bar. That spread is kept, re-anchored on the board's hue
// and COMPRESSED (FILL_SPREAD): the shipped edge sits nearly opposite the
// body, and re-anchored at full width on an amber board that lands a saturated
// blue over half the main platform, which reads as two platforms welded
// together rather than as one lit slab. An eighth of it keeps the edge a
// distinct tone — deeper and warmer or cooler than the body — without
// splitting the slab into halves.
//
// THE LIP is the light ON the slab, and it takes the room's light directly:
// the main platform's lip sits ON the board's hue — amber in Lantern Corridor,
// magenta under Billboard Roof — rather than opposite it, so the brightest
// line in the drawing agrees with where the light in the painting comes from.
//
// The drop-throughs keep their own lip colour, offset from the main's by the
// same gap the shipped gold and cyan had (≈152°). That gap is not decoration:
// it is how a player tells solid ground from a platform they can fall through,
// and it has to survive on every board.

// LIGHTNESS AND CHROMA ARE NOT DERIVED, ONLY NUDGED. A platform is read at a
// glance, mid-fight, against a painted photograph; its legibility is the value
// structure, and that is a drawing decision made once (render.js
// drawPlatformShape) rather than something a stage's tint gets a vote on.
// Lightness is carried across untouched. Each stop keeps its OWN saturation
// too, scaled by a single factor per board — a muted room (Academy Hall's
// dust) takes its slab down a little, a neon one (Neon Split, Billboard Roof)
// up — so the edge stays the most saturated thing on the slab everywhere, as
// it was authored. Taking the tint's saturation outright instead flattened all
// three stops onto one chroma and turned stone into plastic.

import { getStage } from "./stages.js";

// The two anchors in the shipped palette: the slab body's blue-grey, and the
// main lip's gold. Each base colour keeps its offset from its own anchor.
const BASE_HUE = 220;
const LIP_HUE = 44.6; // hue of the shipped gold lip, #ffd35c
// How much of a fill stop's hue offset survives (see above).
const FILL_SPREAD = 0.12;
// The board's own saturation, mapped onto a scale for the slab's. The tints
// run 0.27 (Academy Hall) to 1.0 (the neon boards), which lands the factor
// between these two; SAT_MAX is the backstop for any tint added later.
const SAT_LO = 0.3, SAT_HI = 1.0;
const CHROMA_LO = 0.7, CHROMA_HI = 1.0;
// Fills are held under SAT_MAX so a slab still reads as stone. The accent lip
// is not a fill — it is the light ON the slab, a two-pixel line, and it was
// authored at full chroma (the gold is #ffd35c); capping it there dulled the
// one part of the drawing that is meant to be vivid, so it keeps its own.
const SAT_MAX = 0.45;

function parseColor(str) {
  const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(str);
  if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] !== undefined ? +m[4] : 1 };
  let hex = /^#([0-9a-f]{3,8})/i.exec(str)?.[1] || "";
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const n = parseInt(hex.slice(0, 6), 16) || 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToCss({ h, s, l }, alpha) {
  const hh = ((h % 360) + 360) % 360;
  const str = `${hh.toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%`;
  return alpha === undefined ? `hsl(${str})` : `hsla(${str}, ${alpha})`;
}

/** Re-anchor one shipped colour onto `hue`, keeping its lightness and its hue
 *  offset from the shipped primary, and pulling its saturation part-way toward
 *  the stage's. `alpha` is passed through for the accent lips, which are
 *  translucent lines rather than fills. */
function reanchor(base, hue, chroma, { alpha, satMax = SAT_MAX, anchor = BASE_HUE, spread = FILL_SPREAD } = {}) {
  const b = rgbToHsl(parseColor(base));
  const s = Math.min(satMax, b.s * chroma);
  return hslToCss({ h: hue + (b.h - anchor) * spread, s, l: b.l }, alpha);
}

// The shipped slab, as the numbers it was authored with. Everything below is
// these colours moved onto a board's hue — the drawing is unchanged.
const BASE = {
  main: ["#263044", "#111827", "#4d3a19"],
  side: ["#1d2739", "#111827", "#2a2f3f"],
  accentMain: ["rgba(255, 211, 92, 0.55)", 0.55],
  accentSide: ["rgba(97, 216, 255, 0.45)", 0.45],
  // The 3D camera's extruded faces (camera3d/stage_geo.js): the lit top, the
  // cut ends, the underside.
  top: { main: "#36405a", other: "#2a3348" },
  end: "#141b2c",
  bottom: "#070a12",
};

const cache = new Map();

/** The platform palette for one board, derived from its `tint`. Memoised per
 *  stage key: this is twenty fixed answers, computed once each. */
export function stagePalette(stageKey) {
  let pal = cache.get(stageKey);
  if (pal) return pal;
  const stage = getStage(stageKey);
  const amb = rgbToHsl(parseColor(stage.tint || "rgba(88, 116, 220, 0.12)"));
  // A near-grey tint (Empty City's overcast, Mist Pier's haze) carries no hue
  // worth anchoring to, so those boards keep the shipped blue-grey rather than
  // swinging on the noise in two or three channel values.
  const hue = amb.s < 0.08 ? BASE_HUE : amb.h;
  const t = Math.min(1, Math.max(0, (amb.s - SAT_LO) / (SAT_HI - SAT_LO)));
  const chroma = CHROMA_LO + (CHROMA_HI - CHROMA_LO) * t;
  const at = (c) => reanchor(c, hue, chroma);
  // The lips keep their full offset from each other and their full chroma —
  // they are the light, and they are what the kinds are told apart by.
  const lip = ([c, a]) => reanchor(c, hue, chroma, { alpha: a, satMax: 1, anchor: LIP_HUE, spread: 1 });
  pal = {
    main: BASE.main.map(at),
    side: BASE.side.map(at),
    accentMain: lip(BASE.accentMain),
    accentSide: lip(BASE.accentSide),
    top: { main: at(BASE.top.main), other: at(BASE.top.other) },
    end: at(BASE.end),
    bottom: at(BASE.bottom),
  };
  cache.set(stageKey, pal);
  return pal;
}
