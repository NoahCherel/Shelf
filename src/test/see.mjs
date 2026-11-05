// One full-screen picture of what's really on screen: the desktop and native windows, with
// Shelf's windows drawn in. Shelf's glass keeps it out of ordinary screenshots, so its pages are
// captured through the debug port and placed at their real positions.
// Usage: node src/test/see.mjs <out.png>
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";

const out = process.argv[2];
const temp = join(mkdtempSync(join(tmpdir(), "shelf-see-")), "screen.png");
spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "src/test/probe.ps1", "-Shot", temp], { stdio: "ignore" });
const screen = PNG.sync.read(readFileSync(temp));

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mine = ++id;
      pending.set(mine, resolve);
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
  return new Promise((resolve) => ws.addEventListener("open", () => resolve({ ws, send })));
}

function drawOver(base, top, left, up) {
  for (let y = 0; y < top.height; y++) {
    for (let x = 0; x < top.width; x++) {
      const [dx, dy] = [x + left, y + up];
      if (dx < 0 || dy < 0 || dx >= base.width || dy >= base.height) continue;
      const from = (y * top.width + x) * 4;
      const to = (dy * base.width + dx) * 4;
      const alpha = top.data[from + 3] / 255;
      for (let c = 0; c < 3; c++) base.data[to + c] = top.data[from + c] * alpha + base.data[to + c] * (1 - alpha);
    }
  }
}

const pages = (await (await fetch("http://127.0.0.1:9333/json")).json()).filter((t) => t.type === "page" && t.url.includes("w="));
// The dock goes first, so anything above it stays on top.
pages.sort((a, b) => Number(b.url.includes("w=dock")) - Number(a.url.includes("w=dock")));
for (const page of pages) {
  // This window isn't hidden from screenshots, and Windows draws its pictures outside the page.
  if (page.url.includes("w=preview")) continue;
  const { ws, send } = await connect(page.webSocketDebuggerUrl);
  const look = (await send("Runtime.evaluate", {
    expression: `JSON.stringify({ x: screenX, y: screenY, scale: devicePixelRatio, width: innerWidth, content: document.getElementById("root").childElementCount, hidden: document.hidden })`,
    returnByValue: true,
  })).result.value;
  const info = JSON.parse(look);
  if (info.content > 0 && !info.hidden && !page.url.includes("w=card")) {
    // Transparent, or a window's see-through corners come back white.
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const shot = await send("Page.captureScreenshot", { format: "png" });
    drawOver(screen, PNG.sync.read(Buffer.from(shot.data, "base64")), Math.round(info.x * info.scale), Math.round(info.y * info.scale));
    console.log(`drew ${page.url.split("?")[1]} at ${info.x},${info.y}`);
  } else if (info.content > 0 && !info.hidden && page.url.includes("w=card")) {
    const open = (await send("Runtime.evaluate", { expression: "!!document.querySelector('.card-window > *')", returnByValue: true })).result.value;
    if (open) {
      await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const shot = await send("Page.captureScreenshot", { format: "png" });
      drawOver(screen, PNG.sync.read(Buffer.from(shot.data, "base64")), Math.round(info.x * info.scale), Math.round(info.y * info.scale));
      console.log(`drew card at ${info.x},${info.y}`);
    }
  }
  ws.close();
}
writeFileSync(out, PNG.sync.write(screen));
console.log(out);
