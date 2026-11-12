// Read-only look at the running dock through the debug port, with the owner's own layout:
// which apps it lists, which one is in focus, and a screenshot. Clicks nothing.
// Usage: node src/test/live-look.mjs <screenshot.png>
import { Page } from "./cdp.mjs";
import { writeFileSync } from "node:fs";

const page = await Page.open("dock");
const send = async (method, params) => (await page.send(method, params)).result;
const ws = page.ws;
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

const apps = await evaluate(`[...document.querySelectorAll(".app")].map((a) => ({
  name: a.getAttribute("aria-label"), open: !!a.querySelector(".app__dot"), focus: a.classList.contains("app--active") }))`);
for (const a of apps) console.log(`${a.focus ? "focus" : a.open ? "open " : "     "} ${a.name}`);
const names = apps.map((a) => a.name);
console.log(`duplicates: ${names.length - new Set(names).size}`);
console.log(`widgets: ${await evaluate(`[...document.querySelectorAll("[data-widget-id]")].map((e) => e.dataset.widgetId).join(", ")`)}`);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(process.argv[2], Buffer.from(shot.data, "base64"));
ws.close();
