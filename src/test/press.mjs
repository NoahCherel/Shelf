// Presses something in a Shelf window, with pointer events inside its own page. The real mouse
// never moves. Usage: node src/test/press.mjs <view> <selector> <left|right>
import { Page } from "./cdp.mjs";
const [view, selector, button] = process.argv.slice(2);
const page = await Page.open(view);
const send = async (method, params) => (await page.send(method, params)).result;
const ws = page.ws;
const at = (await send("Runtime.evaluate", {
  expression: `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  returnByValue: true,
})).result.value;
const base = { ...at, button, clickCount: 1 };
await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, buttons: button === "left" ? 1 : 2 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
ws.close();
