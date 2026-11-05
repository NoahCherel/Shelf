// The visual bench: renders every scene in a headless Edge of its own, compares each with its
// stored picture, and runs its measurements. Nothing appears on screen and nothing real is touched.
// Usage: node src/test/bench/run.mjs [--scene <id>] [--update] [--no-build]
// --update accepts the new pictures: only after viewing them, as it can bless a bug.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedPixels, passes } from "./compare.mjs";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WEB_PORT = 4176;
const DEBUG_PORT = 9444;
const OUT = ".bench";
const BASELINES = "src/test/baselines";
const SETTLE_MS = 1200;

const args = process.argv.slice(2);
const only = args.includes("--scene") ? args[args.indexOf("--scene") + 1] : null;
const update = args.includes("--update");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopTree = (child) => spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`nothing answered at ${url}`);
}

function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mine = ++id;
      pending.set(mine, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
  return new Promise((resolve) => ws.addEventListener("open", () => resolve({ ws, send })));
}

if (!args.includes("--no-build")) {
  const built = spawnSync("npm", ["run", "build"], { shell: true, stdio: "ignore" });
  if (built.status !== 0) throw new Error("build failed: run `npm run build` to see why");
}
mkdirSync(OUT, { recursive: true });
mkdirSync(BASELINES, { recursive: true });

const server = spawn(`npx vite preview --port ${WEB_PORT} --strictPort`, { shell: true, stdio: "ignore" });
const profile = mkdtempSync(join(tmpdir(), "shelf-bench-"));
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failed = 0;
try {
  await waitFor(`http://localhost:${WEB_PORT}/`);
  const list = await (await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const { ws, send } = await connect(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`${expression}: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
    return r.result.value;
  };

  await send("Emulation.setTimezoneOverride", { timezoneId: "Europe/Paris" });
  await send("Emulation.setLocaleOverride", { locale: "en-GB" });
  await send("Page.navigate", { url: `http://localhost:${WEB_PORT}/?w=bench&scene=__list` });
  await sleep(1500);
  const scenes = JSON.parse(await evaluate("JSON.stringify(window.__benchScenes)"));

  for (const scene of scenes) {
    if (only && scene.id !== only) continue;
    const [width, height] = scene.size;
    // Headless Edge otherwise reports a tiny screen, and the dock limits itself to the screen's width.
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scene.scale ?? 1.25,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
    await send("Page.navigate", { url: `http://localhost:${WEB_PORT}/?w=bench&scene=${scene.id}` });
    await sleep(SETTLE_MS);
    await evaluate("document.fonts.ready.then(() => true)");

    for (const step of scene.steps ?? []) {
      const selector = step.hover ?? step.click;
      const at = await evaluate(`(() => {
        const e = document.querySelector(${JSON.stringify(selector)});
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!at) throw new Error(`${scene.id}: nothing matches ${selector}`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at });
      if (step.click) {
        const base = { ...at, button: "left", clickCount: 1 };
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, buttons: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
      }
      await sleep(300);
    }
    await sleep(300);

    const problems = [];
    const pageError = await evaluate("window.__benchError ?? null");
    if (pageError) problems.push(`page error: ${pageError}`);
    for (const m of scene.measure ?? []) {
      if ((await evaluate(`Boolean(${m.expect})`)) !== true) problems.push(`measure failed: ${m.name}`);
    }

    const shot = Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64");
    const outPath = join(OUT, `${scene.id}.png`);
    writeFileSync(outPath, shot);
    const baseline = join(BASELINES, `${scene.id}.png`);
    let verdict;
    if (update) {
      writeFileSync(baseline, shot);
      verdict = "updated";
    } else if (!existsSync(baseline)) {
      verdict = "NO BASELINE";
      problems.push("no stored picture");
    } else {
      const changed = changedPixels(readFileSync(baseline), shot, (png) => writeFileSync(join(OUT, `${scene.id}.diff.png`), png));
      verdict = `${changed} changed pixels`;
      if (!passes(changed)) problems.push(`${changed} pixels differ`);
    }
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${scene.id}: ${verdict}${problems.length ? ` | ${problems.join("; ")}` : ""}`);
  }
  ws.close();
} finally {
  stopTree(edge);
  stopTree(server);
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
