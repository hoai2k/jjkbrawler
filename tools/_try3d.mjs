import { chromium } from "playwright";
const BASE = "http://127.0.0.1:5174";
const QUERY = process.argv[3] || "?camera=3d";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (["error","warning"].includes(m.type()) && !/404|Failed to load|GL Driver/.test(m.text())) console.log(`[${m.type()}]`, m.text().slice(0,300)); });
await page.goto(`${BASE}/index.html${QUERY}`);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click('[data-character="gojo"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 5000 });
await page.locator(".stage-card").nth(Number(process.argv[4] || 0)).click();
const deadline = Date.now() + 90000;
for (;;) {
  const r = await page.evaluate(async () => (await import("/src/state.js")).state.phase === "playing");
  if (r) break;
  if (Date.now() > deadline) throw new Error("match never started");
  await page.waitForTimeout(150);
}
await page.keyboard.press("Backquote");
await page.waitForTimeout(Number(process.argv[5] || 9000));
await page.screenshot({ path: process.argv[2] || "shot.png" });
const info = await page.evaluate(async () => {
  const { cameraMode } = await import("/src/camera_mode.js");
  const { state } = await import("/src/state.js");
  return { cameraMode, stage: state.stageKey, fighters: state.fighters.map(f => [f.charKey, Math.round(f.x)]) };
});
console.log(JSON.stringify(info));
console.log("pageerrors:", JSON.stringify(errors.filter(e => !/404/.test(e)).slice(0,5)));
await browser.close();
