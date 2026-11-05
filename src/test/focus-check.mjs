// Proves the focus mark follows the real foreground window: clicks apps inside the dock's own
// page, so the real mouse never moves. Usage: node src/test/focus-check.mjs <folder> <app> <app>
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, ...apps] = process.argv.slice(2);
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(targets.find((t) => t.url.includes("w=dock")).webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mine = ++id;
    const onMessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === mine) {
        ws.removeEventListener("message", onMessage);
        resolve(m.result);
      }
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: mine, method, params }));
  });
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
