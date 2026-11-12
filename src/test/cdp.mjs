// Talks to Shelf's pages through WebView2's debug port. Clicks go to the page itself, and the real
// mouse never moves. Every command has a time limit, so a page that stops answering is named.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let longest = { ms: 0, what: "" };

function note(ms, method, params) {
  if (ms > longest.ms) longest = { ms, what: `${method} ${String(params.expression ?? "").slice(0, 60)}` };
}

/** The command a page took longest to answer: what to look at when the checks are flaky. */
export const slowest = () => longest;

export async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  return (await res.json()).filter((t) => t.type === "page");
}

export class Page {
  /** Where shot() saves. */
  static shots = ".";

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
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setTimeout(() => reject(new Error(`no answer to ${method} ${String(params.expression ?? "").slice(0, 80)} from ${this.ws.url.slice(-12)}`)), 15000);
      this.pending.set(id, (value) => {
        clearTimeout(timer);
        note(Date.now() - started, method, params);
        resolve(value);
      });
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
    if (r.result?.data) writeFileSync(join(Page.shots, name), Buffer.from(r.result.data, "base64"));
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
