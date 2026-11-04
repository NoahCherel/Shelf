// Generates docs/lumabar/widgets/<category>.md from the catalogue, its measurements and our notes.
// Fails if a widget has no notes, or a note has no matching widget.
const fs = require("fs");
const path = require("path");

const catalogue = require("../_evidence/widgets.json");
const notes = require("./widget-notes.js");
const OUT = path.join(__dirname, "..", "widgets");

const baseName = (w) => w.name.replace(/\s+Preview$/, "");
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const STATES = {
  local: "Active: as shown [O]. Empty: only seen for Calendar; others Gap (G-02). Loading and error: Gap (G-02).",
  key: "Not connected: shows a sample, and its card explains what it needs [S: docs]. Connecting: one real read checks the key [S: connect pages]. Error: plain words on the card, from the connect page [S: connect pages]. Loading: Gap (G-02).",
  oauth: "Not connected: offers Connect and its guide [S: changelog 1.2.6]. Sign-in opens the browser, with a 3-minute timeout on Google sign-ins [S: connect pages]. Signed out: asks to sign in again [S: connect pages]. Loading: Gap (G-02).",
  signin: "Locked until it finds the sign-in; Check again retries [S: connect pages]. Expired: asks to sign in with that tool [S: connect pages]. Keeps the last reading while the tool is closed [S: changelog 1.2.5, 1.2.10]. Loading: Gap (G-02).",
};

function shapeOf(m) {
  if (m.w === m.h) return "square (1:1)";
  return `wide (${(m.w / m.h).toFixed(2)}:1)`;
}

function entry(w) {
  const n = notes[baseName(w)];
  const d = w.dark_measure;
  const l = w.light_measure;
  const lines = [
    `### ${baseName(w)}`,
    "",
    `> ${w.description} [S: widgets]`,
    "",
    "| Field | Detail |",
    "| --- | --- |",
    `| **Category** | ${w.section} [S: widgets] |`,
    `| **Tile shows** | ${n.shows} |`,
    `| **States** | ${STATES[n.kind]} |`,
    `| **Tile size** | ${d.w}×${d.h} px in the capture, ${shapeOf(d)} [M] |`,
    `| **Layout** | Radius ${d.radius} px, rim ${d.rim} at ${Math.round(d.rim_alpha * 100)}%, fill ${d.fill} at ${(d.fill_alpha * 100).toFixed(1)}% in dark. Light: rim ${l.rim} at ${Math.round(l.rim_alpha * 100)}%, fill ${l.fill} at ${(l.fill_alpha * 100).toFixed(1)}% [M] |`,
    `| **Card** | ${n.card} |`,
    `| **Click** | ${n.click} |`,
    `| **Data source** | ${n.data} |`,
    `| **Refresh** | ${n.refresh} |`,
    `| **Setup** | ${n.setup} |`,
    `| **Captures** | \`_evidence/assets/${w.dark}\`, \`_evidence/assets/${w.light}\` [O] |`,
    `| **Buildable here?** | ${n.build} [I] |`,
    "",
  ];
  return lines.join("\n");
}

const missing = catalogue.filter((w) => !notes[baseName(w)]).map(baseName);
const extra = Object.keys(notes).filter((k) => !catalogue.some((w) => baseName(w) === k));
if (missing.length || extra.length) {
  console.error("missing notes:", missing, "\nnotes without widget:", extra);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const sections = {};
for (const w of catalogue) (sections[w.section] ??= []).push(w);
const index = [];
for (const [section, items] of Object.entries(sections)) {
  const file = `${slug(section)}.md`;
  fs.writeFileSync(
    path.join(OUT, file),
    `# ${section} widgets\n\n${items.length} widgets. Tags and the template are explained in [the README](../README.md).\n\n${items.map(entry).join("\n")}`,
  );
  index.push({ section, file, names: items.map(baseName) });
}
fs.writeFileSync(path.join(__dirname, "..", "_evidence", "widget-index.json"), JSON.stringify(index, null, 1));
console.log("wrote", index.length, "files for", catalogue.length, "widgets");
