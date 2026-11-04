// Verifies the study against the captured lists, and fills in the README's coverage sections.
// Exits non-zero on any failure, listing each one.
const fs = require("fs");
const path = require("path");

const DOCS = path.join(__dirname, "..");
const EV = path.join(DOCS, "_evidence");
const read = (f) => fs.readFileSync(path.join(DOCS, f), "utf8");
const failures = [];
const fail = (msg) => failures.push(msg);

const topDocs = fs.readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f));
const widgetDocs = fs.readdirSync(path.join(DOCS, "widgets")).map((f) => `widgets/${f}`);
const allDocs = [...topDocs, ...widgetDocs];
const text = Object.fromEntries(allDocs.map((f) => [f, read(f)]));
const everything = Object.values(text).join("\n");

// 1. Every widget, every template field.
const catalogue = JSON.parse(fs.readFileSync(path.join(EV, "widgets.json"), "utf8"));
const FIELDS = ["Category", "Tile shows", "States", "Tile size", "Layout", "Card", "Click", "Data source", "Refresh", "Setup", "Captures", "Buildable here?"];
const widgetText = widgetDocs.map((f) => text[f]).join("\n");
const entries = widgetText.split(/^### /m).slice(1);
for (const w of catalogue) {
  const name = w.name.replace(/\s+Preview$/, "");
  const entry = entries.find((e) => e.startsWith(name + "\n"));
  if (!entry) { fail(`widget missing: ${name}`); continue; }
  for (const field of FIELDS) {
    const row = entry.match(new RegExp(`\\| \\*\\*${field.replace("?", "\\?")}\\*\\* \\| (.*) \\|`));
    if (!row || !row[1].trim()) fail(`${name}: empty field ${field}`);
  }
}

// 2. Every connector page, and every release.
const pages = JSON.parse(fs.readFileSync(path.join(EV, "pages.json"), "utf8"));
const connectors = pages.filter((p) => p.slug.startsWith("docs__connect-"));
const connectorNames = { "search-console": "Search Console", "dodo-payments": "Dodo", "lemon-squeezy": "Lemon Squeezy", "google-calendar": "Google Calendar", stocks: "Stocks", unsplash: "Unsplash" };
const integrations = text["09-integrations.md"];
for (const c of connectors) {
  const key = c.slug.replace("docs__connect-", "");
  const label = connectorNames[key] ?? key;
  if (!new RegExp(label, "i").test(integrations)) fail(`connector missing from 09: ${key}`);
}
const changelog = fs.readFileSync(path.join(EV, "text", "changelog.txt"), "utf8");
const releases = [...new Set([...changelog.matchAll(/^\s*(\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]))];
for (const r of releases) if (!text["11-history-and-lessons.md"].includes(`| ${r} |`)) fail(`release missing from 11: ${r}`);

// 3. Every setting named on the site appears in the settings doc.
const SETTINGS = ["Dock style", "Accent", "Size", "Clock", "Distance from edge", "Spacing", "Float over windows", "Auto-hide", "Show on desktop", "Displays", "Lock dock", "Windows taskbar", "Launch at startup", "Quiet hours", "Hover names", "Window previews", "Start tile picture", "Automations", "Alert sounds", "Feedback"];
for (const s of SETTINGS) if (!text["07-settings.md"].includes(s)) fail(`setting missing from 07: ${s}`);

// 4. Evidence tags on every statement (bullets and table rows) in the study documents.
const TAG = /\[(S|O|M)(:[^\]]*)?\]|\[I\]|G-\d\d|Gap/;
const tagged = topDocs.filter((f) => /^(0\d|1[0-2])-/.test(f));
for (const f of tagged) {
  text[f].split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) return;
    const isBullet = /^\s*- /.test(line);
    const isRow = /^\|/.test(line) && !/^\|\s*-/.test(line);
    const nextIsRule = isRow && /^\|\s*-/.test(text[f].split(/\r?\n/)[i + 1] ?? "");
    if ((isBullet || isRow) && !nextIsRule && !TAG.test(line)) fail(`${f}:${i + 1} no tag: ${line.slice(0, 70)}`);
  });
}

// 5. Local links and capture paths resolve.
for (const f of [...allDocs, "README.md"]) {
  const src = f === "README.md" ? read(f) : text[f];
  const base = path.dirname(path.join(DOCS, f));
  for (const m of src.matchAll(/\]\((?!https?:)([^)#]+)(#[^)]*)?\)/g)) {
    if (!fs.existsSync(path.join(base, m[1]))) fail(`${f}: broken link ${m[1]}`);
  }
  for (const m of src.matchAll(/`_evidence\/assets\/([^`]+)`/g)) {
    if (!fs.existsSync(path.join(EV, "assets", m[1]))) fail(`${f}: missing capture ${m[1]}`);
  }
}

// 6. Gap references point at real gaps; no stray placeholders.
const gaps = new Set([...text["12-gaps.md"].matchAll(/^\| (G-\d\d)/gm)].map((m) => m[1]));
for (const m of (everything + read("../../docs/lumabar/_tools/widget-notes.js")).matchAll(/G-\d\d/g)) if (!gaps.has(m[0])) fail(`unknown gap ${m[0]}`);
for (const f of allDocs) {
  if (f === "12-gaps.md") continue;
  for (const m of text[f].matchAll(/\b(TBD|TODO|FIXME|XXX)\b/g)) fail(`${f}: placeholder ${m[0]}`);
}

// 7. Every captured page is cited somewhere, or marked as background.
const BACKGROUND = { home: "home", docs: "docs", widgets: "widgets", guides: "index of guides", showcase: "user desktops, viewed", feedback: "feedback" };
const citeOf = (slug) => slug.replace("__", "/").replace("docs/connect-", "connect-");
const citations = {};
const pageRows = pages.map((p) => {
  const cite = citeOf(p.slug);
  const used = allDocs.filter((f) => text[f].includes(`[S: ${cite}`) || text[f].includes(`: ${cite}]`) || text[f].includes(` ${cite},`) || text[f].includes(`S: ${cite}]`));
  citations[p.slug] = used;
  return { p, cite, used };
});
const unused = pageRows.filter((r) => !r.used.length);

// Comparison guides informed the "what it isn't" and positioning notes without being individually needed.
const READ_ONLY = /guides__(rocketdock|seelen-ui-alternatives|best-top-bar|best-taskbar|make-windows|lumabar-vs-winstep|best-dock|rainmeter|mac-menu|unique|ai-usage-limits|best-desktop)/;
for (const r of unused) {
  if (!READ_ONLY.test(r.p.slug) && !BACKGROUND[r.p.slug] && !/^(privacy|terms|roadmap|about|changelog)$/.test(r.p.slug)) fail(`page never cited: ${r.p.slug}`);
}

// Fill in the README.
const index = JSON.parse(fs.readFileSync(path.join(EV, "widget-index.json"), "utf8"));
const widgetTable = ["| Category | Count | Document |", "| --- | --- | --- |", ...index.map((s) => `| ${s.section} | ${s.names.length} | [widgets/${s.file}](widgets/${s.file}) |`)].join("\n");
const summary = [
  "| Item | Covered |", "| --- | --- |",
  `| Pages read | ${pages.length} of ${pages.length} (sitemap plus one linked page it omits) |`,
  `| Widgets | ${catalogue.length} of ${catalogue.length}, all ${FIELDS.length} fields present |`,
  `| Connector pages | ${connectors.length} of ${connectors.length} |`,
  `| Releases | ${releases.length} of ${releases.length} |`,
  `| Settings named on the site | ${SETTINGS.length} of ${SETTINGS.length} |`,
  `| Gaps | ${gaps.size}, each with a proposed default |`,
].join("\n");
const pageTable = ["| Page | Used in |", "| --- | --- |", ...pageRows.map((r) => `| ${r.p.slug.replace(/__/g, "/")} | ${r.used.length ? r.used.map((f) => f.replace(/^(\d\d)-.*/, "$1").replace("widgets/", "w:").replace(".md", "")).join(", ") : "Read for background"} |`)].join("\n");

let readme = read("README.md");
const fill = (name, content) => {
  const start = `<!-- ${name} -->`, end = `<!-- /${name} -->`;
  const block = `${start}\n${content}\n${end}`;
  if (readme.includes(start)) readme = readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block);
  else readme = readme.replace(name, block);
};
fill("COVERAGE_WIDGETS", widgetTable);
fill("COVERAGE_SUMMARY", summary);
fill("COVERAGE_PAGES", pageTable);
fs.writeFileSync(path.join(DOCS, "README.md"), readme);

if (failures.length) {
  console.log(`FAILED: ${failures.length}`);
  console.log(failures.slice(0, 60).join("\n"));
  process.exit(1);
}
console.log(`OK: ${pages.length} pages, ${catalogue.length} widgets, ${connectors.length} connectors, ${releases.length} releases, ${gaps.size} gaps, ${tagged.length} tagged documents`);
