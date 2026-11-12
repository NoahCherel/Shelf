// Drives the running app through WebView2's debug port: clicks go to Shelf's own pages, and the
// real mouse never moves. Start the app with:
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
// Usage: node src/test/cdp-check.mjs <folder for screenshots>
import { mkdirSync } from "node:fs";
import { Page, slowest, targets } from "./cdp.mjs";

const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });
Page.shots = out;

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
await settings.eval(`[...document.querySelectorAll('[aria-label="Style"] [role="radio"]')].find((e) => e.textContent === "Black").click()`);
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

// Each part of the dock opens its own card, centred on it and fully on screen. Escape closes it.
const screenBox = `(() => ({ width: screen.width, height: screen.height, x: screenX, y: screenY, w: innerWidth, h: innerHeight }))()`;
for (const [selector, marker, name] of [
  ['[aria-label="Network"]', "Wi-Fi", "Wi-Fi"],
  ['[aria-label="Sound"]', "OUTPUT", "Sound"],
  ['[aria-label="Search"]', "", "Search"],
  ['[aria-label="Notifications"]', "Notification settings", "Notifications"],
]) {
  const part = await dock.centre(selector);
  const at = await dock.eval(`(${screenBox.slice(1, -1)})`);
  await dock.clickAt(part.x, part.y);
  await sleep(1300);
  const box = await card.eval(`(${screenBox.slice(1, -1)})`);
  const centre = box.x + box.w / 2;
  const onScreen = box.x >= 0 && box.x + box.w <= box.width && box.y >= 0 && box.y + box.h <= box.height;
  const shown = name === "Search" ? await card.eval(`!!document.querySelector(".search__box input")`) : await card.eval(`document.body.textContent.includes(${JSON.stringify(marker)})`);
  check(`${name} opens its own card`, shown);
  const off = Math.abs(centre - (at.x + part.x));
  // A wide card near the edge is kept on screen rather than centred.
  check(`${name}'s card sits over its part, on screen`, onScreen && (off <= 8 || box.x <= 16 || box.x + box.w >= box.width - 16), `${off.toFixed(1)} px off`);
  await card.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(600);
  check(`Escape closes ${name}`, await card.eval(`!document.querySelector(".card-window > *")`));
}

const quickPart = (await dock.centre('[aria-label="Battery"]')) ? '[aria-label="Battery"]' : '[aria-label="Quick settings"]';
await dock.click(quickPart);
await sleep(1300);
check("Quick Settings opens its own card", await card.eval(`!!document.querySelector(".quick__pills")`));
await card.click('[aria-label="Wi-Fi networks"]');
await sleep(900);
check("its chevron moves to the Wi-Fi card", await card.eval(`document.body.textContent.includes("Wi-Fi settings")`));
await card.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(600);

// Right-clicking an app shows its menu above it, with nothing that ends a process.
{
  const app = await dock.eval(`(() => { const a = [...document.querySelectorAll(".app")].find((e) => e.querySelector(".app__dot")); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (app) {
    await dock.clickAt(app.x, app.y, "right");
    await sleep(1000);
    const rows = await card.eval(`[...document.querySelectorAll(".amenu__row")].map((e) => e.textContent)`);
    check("right-clicking an app offers its taskbar menu", rows?.length >= 2, rows?.join(", "));
    check("nothing in it ends a task", !rows?.some((r) => /fin de t|end task/i.test(r)));
    await card.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(600);
  }
}

// Hovering an open app shows its live previews.
const openApp = await dock.eval(`(() => { const a = [...document.querySelectorAll(".app")].find((e) => e.querySelector(".app__dot")); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
if (openApp) {
  const strip = await Page.open("preview");
  // The right-click above left the pointer on this icon, and arriving is what counts as a hover.
  await dock.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  await sleep(200);
  await dock.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: openApp.x - 1, y: openApp.y });
  await dock.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: openApp.x, y: openApp.y });
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    await sleep(50);
    seen = await strip.eval(`!!document.querySelector(".pv__window")`);
  }
  check("hovering an open app shows its previews", seen);
  await dock.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  await sleep(1200);
  check("moving away closes them", !(await strip.eval(`!!document.querySelector(".pv__window")`)));
  strip.close();
} else {
  console.log("skip previews: no app is open");
}

console.log(`slowest answer: ${slowest().ms} ms, ${slowest().what}`);
for (const p of [dock, card]) p.close();
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
