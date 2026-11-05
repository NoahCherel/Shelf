// Presses something in a Shelf window, with pointer events inside its own page. The real mouse
// never moves. Usage: node src/test/press.mjs <view> <selector> <left|right>
const [view, selector, button] = process.argv.slice(2);
const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(targets.find((t) => t.url.includes(`w=${view}`)).webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));
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
const at = (await send("Runtime.evaluate", {
  expression: `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  returnByValue: true,
})).result.value;
const base = { ...at, button, clickCount: 1 };
await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, buttons: button === "left" ? 1 : 2 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
ws.close();
