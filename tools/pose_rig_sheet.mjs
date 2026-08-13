// Every pose's RIG, beside the drawing it was read from, as one sheet.
//
//   node tools/pose_rig_sheet.mjs yuji [--out debug/rig] [--poses idle_a,run_a]
//
// The contact sheet (tools/pose_contact_sheet.py) answers "are the joints on
// the art". This answers the question after it: "does the BODY those joints
// describe look like the drawing" — which is a different question and catches
// a different class of error. A read can put every joint dead on the ink and
// still hand the rig a leg crossed behind the other one, a pelvis facing the
// wrong way, or an arm that only looks right because it is foreshortened to
// nothing. None of that is visible flat. All of it is obvious side by side.
//
// It drives the real editor in a real browser rather than reimplementing the
// interpreter, because a sheet drawn by a second implementation proves nothing
// about the first. Needs playwright, like tools/smoke_pose_edit.mjs.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.WORKBENCH_URL || "http://127.0.0.1:5174";

const args = process.argv.slice(2);
const char = args.find((a) => !a.startsWith("--")) || "yuji";
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const outDir = join(ROOT, flag("out") || "debug/rig-sheet");
const only = flag("poses")?.split(",");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/render3d/workbench/?edit=pose&char=${char}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__workbenchReady, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const poses = only || await page.$$eval("[data-pose]", (els) => els.map((e) => e.dataset.pose));
const rows = [];
for (const pose of poses) {
  await page.click(`[data-pose="${pose}"]`);
  await page.waitForTimeout(450);
  const plate = (await page.locator("#plate").screenshot()).toString("base64");
  const rig = (await page.locator("#rigView").screenshot()).toString("base64");
  const facing = (await page.locator("#facingRead").textContent()) || "";
  rows.push({ pose, plate, rig, facing: facing.trim() });
  process.stdout.write(`${pose} `);
}
process.stdout.write("\n");
await browser.close();

const cells = rows.map((r) => `
  <figure>
    <div class="pair">
      <img src="data:image/png;base64,${r.plate}" alt="${r.pose} drawing and joints">
      <img src="data:image/png;base64,${r.rig}" alt="${r.pose} rig">
    </div>
    <figcaption><b>${r.pose}</b> <span>${r.facing}</span></figcaption>
  </figure>`).join("");

const html = `<!doctype html><meta charset="utf-8">
<title>${char} — the rig beside the drawing</title>
<style>
  body { background:#0c1114; color:#dbe2f0; font:14px system-ui,sans-serif; margin:0; padding:20px; }
  h1 { font-size:18px; letter-spacing:.06em; text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:14px; }
  figure { margin:0; background:#141b2b; border:1px solid #26314c; border-radius:6px; padding:6px; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .pair img { width:100%; display:block; border-radius:3px; }
  figcaption { padding:6px 4px 2px; font:12px ui-monospace,Menlo,monospace; display:flex;
               justify-content:space-between; gap:10px; }
  figcaption span { color:#8fb8a0; }
</style>
<h1>${char} — the rig beside the drawing (${rows.length} poses)</h1>
<div class="grid">${cells}</div>`;

const out = join(outDir, `${char}-rig-sheet.html`);
writeFileSync(out, html);
console.log(`${out}  (${rows.length} poses)`);
if (errors.length) {
  console.error(`page errors:\n${errors.join("\n")}`);
  process.exit(1);
}
