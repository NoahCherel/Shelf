// Drives the running app through WebView2's debug port: clicks go to Shelf's own pages, and the
// real mouse never moves. Start the app with:
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
// Usage: node src/test/cdp-check.mjs <folder for screenshots>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 9333;
const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  return (await res.json()).filter((t) => t.type === "page");
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      }
    });
  }
  static async open(view) {
    for (let i = 0; i < 40; i++) {
      const t = (await targets()).find((x) => x.url.includes(`w=${view}`));
      if (t) {
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve);
          ws.addEventListener("error", reject);
        });
        return new Page(ws);
      }
      await sleep(250);
    }
    throw new Error(`no ${view} window`);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  }
  async shot(name) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) writeFileSync(join(out, name), Buffer.from(r.result.data, "base64"));
  }
  async centre(selector) {
    return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  }
  async click(selector, button = "left") {
    const c = await this.centre(selector);
    if (!c) throw new Error(`nothing to click: ${selector}`);
    await this.clickAt(c.x, c.y, button);
  }
  async clickAt(x, y, button = "left") {
    const base = { x, y, button, clickCount: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, buttons: button === "left" ? 1 : 2 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
  }
  async drag(from, to) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      const x = from.x + ((to.x - from.x) * i) / 12;
      await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: from.y, button: "left", buttons: 1 });
      await sleep(30);
    }
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: from.y, button: "left", buttons: 0, clickCount: 1 });
  }
  close() {
    this.ws.close();
  }
}

const ids = (p) => p.eval(`[...document.querySelectorAll("[data-widget-id]")].map((e) => e.dataset.widgetId)`);

const dock = await Page.open("dock");
await sleep(3000);
await dock.shot("dock.png");

const start = await ids(dock);
check("default layout loads", start.length >= 4, start.join(", "));
check("Claude reads real limits", /\d+%/.test(await dock.eval(`document.querySelector('[data-widget-id="claude-plan-usage"]').textContent`)));
const icons = await dock.eval(`document.querySelectorAll(".app__icon[src]").length`);
let blanks = await dock.eval(`document.querySelectorAll(".app__icon--blank").length`);
for (let i = 0; i < 8 && blanks; i++) {
  await sleep(1500);
  blanks = await dock.eval(`document.querySelectorAll(".app__icon--blank").length`);
}
check("app icons load", blanks === 0, `${await dock.eval(`document.querySelectorAll(".app__icon[src]").length`)} icons, ${blanks} blank, ${icons} at first`);
// Measured in the real dock: a CSS mistake once left these squeezed to their icons with every test green.
const room = await dock.eval(`(() => {
  const apps = [...document.querySelectorAll(".app")].map((a) => a.getBoundingClientRect());
  const T = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--T"));
  const icon = document.querySelector(".app .app__icon").getBoundingClientRect().width;
  return { T, icon, pitch: apps[1].left - apps[0].left };
})()`);
check("apps have a taskbar button's room", room.pitch >= room.T * 0.9, `${room.pitch.toFixed(1)} px apart, icon ${room.icon.toFixed(1)}`);
check("the focus plate is wider than the icon", room.pitch - room.T * 0.2 > room.icon);
check("the status tile shows the network", await dock.eval(`!!document.querySelector('[data-widget-id="system-status"] [data-net]')`));
check("glass canvas is live", await dock.eval(`!!document.querySelector("canvas.glass") && document.querySelector(".dock").dataset.glass === "true"`));

// Card over its tile
await dock.click('[data-widget-id="clock-and-weather"]');
const card = await Page.open("card");
await sleep(1500);
check("clicking the clock opens the date card", await card.eval(`!!document.querySelector(".date__grid")`));
await card.shot("card-date.png");

// Clicking again closes it (the same tile toggles)
await dock.click('[data-widget-id="clock-and-weather"]');
await sleep(400);
await dock.click('[data-widget-id="claude-plan-usage"]');
await sleep(700);
check("the Claude card shows both limits", await card.eval(`/Session/.test(document.body.textContent) && /Weekly/.test(document.body.textContent)`));
await card.shot("card-claude.png");
await card.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(400);

// Right-click menu
await dock.click('[data-widget-id="github-activity"]', "right");
await sleep(700);
const menu = await card.eval(`[...document.querySelectorAll(".menu__row")].map((e) => e.textContent)`);
check("right-click offers the menu", ["Logout", "Widgets…", "Settings", "Lock dock", "Quit"].every((x) => menu?.includes(x)), menu?.join(", "));
await card.shot("menu.png");

// Picker from the menu
await card.eval(`[...document.querySelectorAll(".menu__row")].find((e) => e.textContent === "Widgets…").click()`);
const picker = await Page.open("picker");
await sleep(1200);
check("the picker lists all widgets", (await picker.eval(`document.querySelectorAll(".pick").length`)) === 12);
await picker.shot("picker.png");
check("the dock shows − badges", (await dock.eval(`document.querySelectorAll(".slot__remove").length`)) === start.length);
await dock.shot("dock-badges.png");

await picker.eval(`document.querySelector('[aria-label="Battery"]').click()`);
await sleep(800);
check("clicking a picker tile adds it last", (await ids(dock)).at(-1) === "battery");
await dock.click('[aria-label="Remove Battery"]');
await sleep(800);
check("the − badge removes it", !(await ids(dock)).includes("battery"));

// Dragging, with the picker closed
await picker.click('[aria-label="Close"]');
await sleep(800);
check("closing the picker clears the badges", (await dock.eval(`document.querySelectorAll(".slot__remove").length`)) === 0);
const a = await dock.centre('[data-widget-id="github-activity"]');
const b = await dock.centre('[data-widget-id="clock-and-weather"]');
await dock.drag(a, { x: b.x + 20, y: a.y });
await sleep(700);
const dragged = await ids(dock);
check("dragging reorders the dock", dragged.indexOf("github-activity") > dragged.indexOf("clock-and-weather"), dragged.join(", "));
await dock.drag(await dock.centre('[data-widget-id="clock-and-weather"]'), { x: a.x - 60, y: a.y });
await sleep(500);

// Settings from the menu
await dock.click('[data-widget-id="github-activity"]', "right");
await sleep(600);
await card.eval(`[...document.querySelectorAll(".menu__row")].find((e) => e.textContent === "Settings").click()`);
const settings = await Page.open("settings");
await sleep(1000);
await settings.shot("settings-appearance.png");
await settings.eval(`[...document.querySelectorAll(".side__row")].find((e) => e.textContent === "Dock").click()`);
await sleep(300);
await settings.shot("settings-dock.png");
await settings.eval(`document.querySelector('[aria-label="L"]').click()`);
await sleep(1200);
check("the size slider reaches the dock", (await dock.eval(`getComputedStyle(document.documentElement).getPropertyValue("--T").trim()`)) === "62px");
await dock.shot("dock-large.png");
await settings.eval(`document.querySelector('[aria-label="M"]').click()`);
await sleep(600);
await settings.eval(`[...document.querySelectorAll(".side__row")].find((e) => e.textContent === "Appearance").click()`);
await sleep(200);
await settings.eval(`document.querySelector('[role="radio"][aria-checked="false"]').click()`);
await sleep(1000);
check("switching to Black stops the glass", await dock.eval(`document.querySelector("canvas.glass") === null`));
await dock.shot("dock-black.png");
await settings.eval(`[...document.querySelectorAll('[role="radio"]')].find((e) => e.textContent === "Liquid Glass").click()`);
await sleep(1200);
check("switching back brings it back", await dock.eval(`!!document.querySelector("canvas.glass")`));
await dock.shot("dock-glass.png");
await settings.eval(`[...document.querySelectorAll(".side__row")].find((e) => e.textContent === "General").click()`);
await sleep(300);
await settings.shot("settings-general.png");
await settings.click('[aria-label="Close"]');
await sleep(600);
check("Settings closes", !(await targets()).some((t) => t.url.includes("w=settings")));

for (const p of [dock, card]) p.close();
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
