// Refusing a drawing has to still be refused when you look again.
//
// A delete tag is a statement about an IMAGE, so `setDrawingDoomed` writes it
// onto the drawing's variant option — creating one where the pose has never had
// options, which is every sheet cell nothing draws. Those are exactly the
// drawings most likely to be junk, and exactly where this broke: the picker
// rebuilt the tile for a pose's own drawing with no `option` attached, so the
// tag it had just written was invisible the next time the chooser opened.
// Forty-seven tagged drawings came back looking untouched, while the export
// carried all forty-seven correctly.
//
// The same session reported "none" at the top of the screen, because the change
// summary counted poses whose NUMBERS had moved and a refusal moves none.
//
// Nothing is written to disk: the manifest is mutated in the page and the tab
// is closed. Three things are asserted against the real workbench modules:
//
//   1. tagging a drawing the game does not show puts the tag on
//   2. rebuilding the catalogue — what reopening the picker does — still finds it
//   3. the change summary says a refusal happened
//
//   node server.mjs &
//   node tools/smoke_delete_tags.mjs [base-url]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
});

let fails = 0;
const check = (ok, label, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? `  ${extra}` : ""}`);
};

await page.goto(`${BASE}/sprites/workbench/?char=gojo`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 900; i++) {
  if (await page.evaluate(() => /assets loaded/.test(document.getElementById("loadState")?.textContent || ""))) break;
  await page.waitForTimeout(200);
}

const out = await page.evaluate(async () => {
  const picker = await import("/sprites/workbench/bench_picker.js");
  const model = await import("/sprites/workbench/bench_model.js");
  const exp = await import("/sprites/workbench/bench_export.js");
  const { state } = await import("/sprites/workbench/bench_state.js");

  const find = () => picker.spriteCatalogue(state.char, "idle_a")
    .filter((d) => d.file && !d.head);
  // A drawing the game does not show AND whose pose has never had an option —
  // the case the picker could not see. A sheet cell nothing draws is one.
  const before = find();
  const drawn = model.drawnFiles(state.char);
  const target = before.find((d) => d.primary && !drawn.has(d.file)
                                    && !model.variantEntry(state.char, d.pose));
  if (!target) return { skip: "no untagged, undrawn, option-less drawing on this character" };

  const summaryBefore = document.getElementById("dirtyCount").textContent;
  const tile = document.createElement("button");
  picker.setDrawingDoomed(target, true, tile, () => {});

  // What reopening the chooser does: build the list again from the manifest.
  const after = find().find((d) => d.file === target.file);

  return {
    pose: target.pose, file: target.file,
    tagged: model.hasDeleteTag(state.char, target.pose),
    seenAgain: after?.option?.needsReplacement === "delete",
    tileClass: tile.className,
    summaryBefore,
    summaryAfter: document.getElementById("dirtyCount").textContent,
    exported: (exp.payloadFor(state.char)?.variantPlacement?.[target.pose] || [])
      .some((o) => o.file === target.file && o.needsReplacement === "delete"),
  };
});

if (out.skip) {
  console.log(`SKIP ${out.skip}`);
} else {
  console.log(`     refusing ${out.file} (${out.pose})`);
  check(out.tagged, "the tag goes on the drawing", out.file);
  check(out.seenAgain, "...and is still there when the chooser is rebuilt",
        out.seenAgain ? "doomed" : "THE TILE FORGOT IT");
  check(out.tileClass.includes("doomed"), "the tile it was clicked on shows it", out.tileClass);
  check(out.summaryBefore === "none", "the session started with nothing to export", out.summaryBefore);
  check(/flagged/.test(out.summaryAfter), "and now says a refusal happened", out.summaryAfter);
  check(out.exported, "the export carries the tag");
}
check(!errors.length, "no page errors", errors.join(" | "));

await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nall delete-tag checks passed");
process.exit(fails ? 1 : 0);
