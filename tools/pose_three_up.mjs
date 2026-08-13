// EVERY POSE, THREE WAYS, beside the drawing it came from.
//
//   node tools/pose_three_up.mjs [char] [--out debug] [--poses idle_a,guard]
//
// The pose editor's mode cycle answers "which of these three is best for THIS
// frame", one frame at a time, by hand. This asks the same question of a whole
// sheet at once, which is a different and cheaper thing to look at: the
// drawing, then the matched human pose, then the pose generated from the
// joints, then the clip the game plays today, in a row.
//
// It is the deciding view. Neither proposal is worth shipping unless it beats
// what is already in the game, and that is not arguable from either one alone.
//
// Needs playwright and a running `node server.mjs`, like tools/pose_rig_sheet.mjs.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.WORKBENCH_URL || 'http://127.0.0.1:5174';
const argv = process.argv.slice(2);
const char = argv.find((a) => !a.startsWith('--')) || 'yuji';
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const outDir = join(ROOT, flag('out') || 'debug/three-up');
const only = flag('poses')?.split(',');
mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${BASE}/render3d/workbench/?edit=pose&char=${char}`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__workbenchReady, null, { timeout: 60000 });
await p.waitForTimeout(1200);
const poses = only || await p.$$eval('[data-pose]', (els) => els.map((e) => e.dataset.pose));
const rows = [];
for (const pose of poses) {
  await p.click(`[data-pose="${pose}"]`); await p.waitForTimeout(400);
  const plate = (await p.locator('#plate').screenshot()).toString('base64');
  const shots = {}; const how = {};
  for (const want of ['Matched', 'Generated', 'In Game']) {
    while ((await p.textContent('#poseMode')).trim() !== want) {
      await p.click('#poseModeBox'); await p.waitForTimeout(350);
    }
    await p.waitForTimeout(200);
    shots[want] = (await p.locator('#rigView').screenshot()).toString('base64');
    // What the pane ACTUALLY did — a frame with no match, or one nothing in
    // the game draws, falls back, and a sheet that hid that would be lying.
    how[want] = (await p.textContent('#poseHow')).replace(/^3D: /, '');
  }
  rows.push({ pose, plate, shots, how });
  process.stdout.write(pose + ' ');
}
process.stdout.write('\n');
await b.close();
const cells = rows.map((r) => `<figure><div class="row">
  <div><img src="data:image/png;base64,${r.plate}"><figcaption>drawing</figcaption></div>
  ${['Matched', 'Generated', 'In Game'].map((k) => `<div><img src="data:image/png;base64,${r.shots[k]}"><figcaption>${k}<br><i>${r.how[k]}</i></figcaption></div>`).join('')}
</div><b>${r.pose}</b></figure>`).join('');
const out = join(outDir, `${char}-three-up.html`);
writeFileSync(out, `<!doctype html><meta charset=utf-8><title>${char} — three ways</title>
<style>body{background:#0c1114;color:#dbe2f0;font:13px system-ui;margin:0;padding:16px}
figure{margin:0 0 14px;background:#141b2b;border:1px solid #26314c;border-radius:6px;padding:8px}
.row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}img{width:100%;display:block;border-radius:3px}
figcaption{font:11px ui-monospace;color:#8fb8a0;text-align:center;padding-top:3px}
b{font:12px ui-monospace;color:#d8a657}i{color:#6b7690;font-style:normal;font-size:10px}</style>
<h1 style="font:600 15px system-ui;letter-spacing:.05em">${char.toUpperCase()} — the drawing, the matched pose, the generated pose, and what the game plays (${rows.length})</h1>
${cells}`);
console.log(out, `(${rows.length} poses)`);
if (errors.length) { console.error(`page errors:\n${errors.join('\n')}`); process.exit(1); }
