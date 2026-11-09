// Proves the focus mark follows the real foreground window: clicks apps inside the dock's own
// page, so the real mouse never moves. Usage: node src/test/focus-check.mjs <folder> <app> <app>
import { Page } from "./cdp.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, ...apps] = process.argv.slice(2);
const page = await Page.open("dock");
const send = async (method, params) => (await page.send(method, params)).result;
const ws = page.ws;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
const focused = () => evaluate(`[...document.querySelectorAll(".app--active")].map((a) => a.getAttribute("aria-label")).join(",")`);

let failed = 0;
for (const app of apps) {
  await evaluate(`document.querySelector('.app[aria-label="${app}"]').click()`);
  await sleep(2500);
  const now = await focused();
  const ok = now === app;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} clicked ${app}, marked: ${now || "none"}`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `focus-${app}.png`), Buffer.from(shot.data, "base64"));
}
ws.close();
process.exit(failed ? 1 : 0);
