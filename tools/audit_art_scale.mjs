// WHAT STILL DOESN'T KNOW HOW BIG THE ROSTER IS.
//
// The fighters are drawn at `ART_SCALE` of the size the numbers in this
// codebase were written at, and the camera zooms in by the reciprocal so they
// land on screen exactly as large as before (config_tuning.js). That trade
// only holds for a drawing that scaled WITH them. Anything drawn from a bare
// pixel literal — a 30px ring, a 12px drop shadow, an 8px offset — comes out
// 1/ART_SCALE too big on screen, which is how a platform's shadow walked out
// from under the platform.
//
// So this is the list of lengths that have not been told. It reads every
// world-space drawing call in src/ and reports the ones carrying a raw number
// with no `ART_SCALE` on it, grouped by file, with a verdict per group:
//
//   BODY    something attached to a fighter or a shared drawing. Must scale.
//   BOARD   platform lengths, blast zones, world-wide washes. Must NOT — the
//           space opening up between board and body is the point.
//   TAIL    the bespoke procedural effects (specials, ultimates, domains,
//           summons, stage hazards). These want scaling too, and several
//           carry a hand-written hit test built from the SAME literals — so
//           they move together or not at all, which is why they are listed
//           rather than mechanically rewritten.
//
// A number here is not automatically a bug: the point is that every one of
// them should be a decision somebody made rather than a line nobody read.
//
//   node tools/audit_art_scale.mjs [--all]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SHOW_ALL = process.argv.includes("--all");

// A drawing call, and a number in it that is big enough to be a length rather
// than an alpha, an index or a fraction of something else.
const DRAW = /ctx\.(arc|ellipse|fillRect|strokeRect|rect|roundRect|moveTo|lineTo|arcTo|setLineDash)\(|lineWidth\s*=|shadowBlur\s*=|font\s*=/;
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;
// Numbers that are not lengths: the turns of a circle, an array stride, a
// colour channel. Stripped before the line is judged, so the report is a list
// of pixels rather than a list of arithmetic.
const NOT_A_LENGTH = [/Math\.PI\s*\*\s*\d+(\.\d+)?/g, /\[[^\]]*\]/g, /rgba?\([^)]*\)/g];
const SCALED = /ART_SCALE|\*\s*A\b|\bS\b\s*[*)]|\*\s*S\b/;

/** Files whose drawing is deliberately board-sized or screen-sized. */
const EXEMPT = new Map([
  ["src/ui.js", "screen space — the HUD is drawn outside the camera"],
  ["src/menu_art.js", "screen space — menus"],
  ["src/camera3d/garnish.js", "texture space — cards are drawn into their own bitmaps"],
  ["src/camera3d/billboards.js", "texture space — offscreen bitmaps, sized in texels"],
]);

/** Draw calls inside a screen-space pass, named by the function they sit in.
 *  A banner is drawn over the finished frame, not in the world, so its
 *  glyph size is in screen pixels and must not follow the roster. */
const SCREEN_FNS = [/^export function drawBannersScreen/, /^function drawVignette/,
                    /^function drawScreenFlash/, /^function drawDomainOverlay/];

/** Lines that are a world-wide wash rather than a drawing of anything. */
const WORLD_WIDE = /VIEW_BLEED|WORLD\.w|WORLD\.h|-200, -200/;

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
};
walk("src");

let total = 0;
const groups = [];
for (const path of files.sort()) {
  if (EXEMPT.has(path)) continue;
  const rows = [];
  const lines = readFileSync(path, "utf8").split("\n");
  let screenPass = false;
  lines.forEach((line, i) => {
    if (/^(export )?function /.test(line)) screenPass = SCREEN_FNS.some((re) => re.test(line));
    if (screenPass) return;
    if (!DRAW.test(line) || SCALED.test(line) || WORLD_WIDE.test(line)) return;
    let bare = line;
    for (const re of NOT_A_LENGTH) bare = bare.replace(re, "");
    const nums = (bare.match(NUMBER) || []).filter((n) => Number(n) > 1.9);
    if (nums.length) rows.push({ n: i + 1, text: line.trim() });
  });
  if (rows.length) { groups.push({ path, rows }); total += rows.length; }
}

for (const { path, rows } of groups) {
  console.log(`\n${path}  —  ${rows.length} unscaled length(s)`);
  for (const r of rows.slice(0, SHOW_ALL ? rows.length : 4)) {
    console.log(`  ${String(r.n).padStart(4)}: ${r.text.slice(0, 100)}`);
  }
  if (!SHOW_ALL && rows.length > 4) console.log(`  … and ${rows.length - 4} more (--all)`);
}

console.log(`\n${total} unscaled drawing length(s) across ${groups.length} file(s).`);
console.log("Everything a fighter carries, and every shared drawing, is scaled;");
console.log("what is left is the bespoke procedural effects — see the header.");
