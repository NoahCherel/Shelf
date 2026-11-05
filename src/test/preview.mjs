// Runs a command against the real app in preview mode, beside the owner's Shelf: a debug build,
// with its own Vite, its own data and a debug port. Stops only what it started.
// Usage: node src/test/preview.mjs <command...>   e.g. node src/test/preview.mjs node src/test/see.mjs out.png
import { spawn, spawnSync } from "node:child_process";

const EXE = "src-tauri/target/debug/shelf.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopTree = (child) => spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });

async function waitFor(url) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`nothing answered at ${url}`);
}

const built = spawnSync("cargo build", { cwd: "src-tauri", shell: true, stdio: "ignore" });
if (built.status !== 0) throw new Error("cargo build failed");

const vite = spawn("npx vite --port 5173 --strictPort", { shell: true, stdio: "ignore" });
let exitCode = 1;
try {
  await waitFor("http://localhost:5173/");
  spawn(EXE, ["--preview"], {
    stdio: "ignore",
    windowsHide: true,
    detached: true,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9333" },
  }).unref();
  await waitFor("http://127.0.0.1:9333/json/list");
  await sleep(4000);
  const command = process.argv.slice(2).join(" ");
  exitCode = spawnSync(command, { shell: true, stdio: "inherit" }).status ?? 1;
} finally {
  spawnSync(EXE, ["--preview", "--quit"], { stdio: "ignore", windowsHide: true });
  await sleep(1500);
  stopTree(vite);
}
process.exit(exitCode);
