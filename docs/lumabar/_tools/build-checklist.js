// Generates 15-feature-checklist.md: every feature in the docs as one numbered line, plus all widgets.
// P1 = the bar itself and your example; P2 = the taskbar's full job and everyday widgets; P3 = everything else.
const fs = require("fs");
const path = require("path");
const catalogue = require("../_evidence/widgets.json");

const groups = {
  "Dock": [
    ["P1", "Pill shape, centred, sized to contents", "02"], ["P1", "Bottom edge, reserved screen space", "02"], ["P1", "Tile-height scaling from one value", "03"],
    ["P2", "Full width mode", "02"], ["P2", "Drag to top edge, remembered, panels open downward", "02"], ["P2", "Size slider with S, M, L", "02"],
    ["P2", "Distance from edge", "02"], ["P2", "Spacing", "02"], ["P2", "Float over windows", "02"], ["P2", "Auto-hide with pointer and Win key", "02"],
    ["P3", "Auto-hide: Show on desktop", "02"], ["P2", "Lock dock", "02"], ["P3", "Narrow by dragging ends; double-click undoes", "02"], ["P3", "Horizontal scrolling with gliding", "02"],
    ["P1", "Hide in fullscreen, stop drawing, free memory", "02"], ["P1", "Recover after sleep and unlock", "02"], ["P2", "Dock on one chosen monitor, remembered", "02"], ["P3", "Dock on all displays", "02"], ["P3", "Dock follows pointer", "02"],
    ["P1", "Resist other tools moving it", "02"], ["P2", "No blink in screen recordings", "02"], ["P2", "Slide animations; widgets part and animate away", "02"], ["P2", "Reserve space from first moment after boot", "02"],
  ],
  "Windows taskbar": [
    ["P1", "Hidden or Auto-hide choice", "02"], ["P1", "Restore exactly on quit, with crash recovery", "13"], ["P1", "Per-screen handling", "02"],
  ],
  "Styles": [
    ["P1", "Liquid Glass with live refraction", "04"], ["P2", "iOS Glass", "04"], ["P2", "Midnight", "03"], ["P1", "Black", "03"], ["P2", "White", "03"], ["P3", "Clear, with black, white or frosted widgets", "03"],
    ["P1", "Dark and light tile sets", "03"], ["P2", "Nine accent colours", "03"], ["P3", "Own accent; Album art accent", "03"], ["P2", "Glass rests when nothing changes", "04"], ["P2", "Glass stays out of its own capture", "04"],
  ],
  "Apps": [
    ["P1", "Start tile opens Start", "05"], ["P1", "Taskbar pins and open windows", "05"], ["P1", "Open dot; click to focus or minimize", "05"], ["P1", "One icon per app, Store apps included", "05"], ["P1", "Sharp icons", "05"],
    ["P2", "Hover names", "05"], ["P2", "Hover previews with title and close; rest shows window", "05"], ["P2", "Jump lists", "05"], ["P2", "Unpin, Close, Pin to dock, End task", "05"], ["P2", "Start quick menu; Explorer Quick access", "05"],
    ["P2", "Drag to pin; drag along; drag off to remove", "05"], ["P3", "Files, folders and stacks on dock", "05"], ["P3", "App groups", "05"], ["P3", "Drag files over an app brings it forward", "05"], ["P3", "Any app or folder as its own widget", "05"], ["P3", "Own picture on Start tile", "05"], ["P2", "Win+T app switching", "05"],
  ],
  "Widget management": [
    ["P1", "Right-click dock menu", "06"], ["P1", "Picker with sidebar, categories, search, count", "06"], ["P1", "Live tiles in picker; click adds; click removes", "06"], ["P1", "− badges while open", "06"], ["P1", "Drag to reorder", "06"], ["P2", "Check marks; red new dots", "06"], ["P2", "Sample until connected", "06"],
  ],
  "Settings": [
    ["P1", "Mac-style Settings window", "07"], ["P1", "Appearance section", "07"], ["P1", "Dock section with info tips", "07"], ["P1", "Windows taskbar and Launch at startup", "07"], ["P2", "12 or 24 hours; seconds", "07"], ["P2", "Hover names and previews switches", "07"], ["P3", "Version and update area", "07"],
  ],
  "Cards": [
    ["P1", "Open over widget with slide; never off-screen", "08"], ["P1", "Standard anatomy", "08"], ["P1", "Check again, Connect, Disconnect, Logout flows", "08"], ["P2", "Tile right-click menus", "08"], ["P2", "Toasts", "08"], ["P2", "Tooltips", "08"], ["P2", "Plain-language errors", "08"],
  ],
  "Automations": [
    ["P3", "Pause music before meetings", "07"], ["P3", "Warn before AI limit", "07"], ["P3", "Renewal reminders", "07"], ["P3", "Review requests to to-dos", "07"], ["P3", "Quiet hours", "07"], ["P3", "Alert tones", "07"], ["P3", "Unified calendar of renewals, payouts, limit resets", "08"], ["P3", "Screen Time daily and weekly summary", "08"],
  ],
  "Platform": [
    ["P1", "Provider runtime with cache and pause", "13"], ["P1", "Secure key storage", "10"], ["P1", "Windows 11 and 10", "01"], ["P2", "Launch at startup that reflects Task Manager", "07"], ["P3", "Works behind inspecting proxies", "09"], ["P3", "32-bit build", "01"], ["P3", "Alt+T for to-dos", "08"],
  ],
};

const P1_WIDGETS = new Set(["Apps", "Claude Usage", "Claude Plan Usage", "Clock & Weather", "GitHub Activity", "Stripe Chart", "Stripe", "Today", "Clock", "Battery", "System Stats", "Tray", "Screen Time", "Now Playing", "Audio Output", "Quick Toggles", "Calendar"]);
const P3_SECTIONS = new Set(["Social", "Analytics", "Developer", "Stocks"]);
const name = (w) => w.name.replace(/\s+Preview$/, "");
const priority = (w) => (P1_WIDGETS.has(name(w)) ? "P1" : P3_SECTIONS.has(w.section) || /Dodo|Shopify|Lemon|Paddle|Gumroad|Polar|Metric|Wallpaper|TikTok|LeetCode/.test(w.name) ? "P3" : "P2");

let n = 0;
let out = `# 15. Feature checklist

Every feature, numbered, for the implementation plan to trace back to. Priorities are proposals for you to change [I]:

- **P1:** the bar itself, your example layout and what you use daily
- **P2:** the taskbar's full job and everyday widgets
- **P3:** everything else

`;
for (const [group, items] of Object.entries(groups)) {
  out += `## ${group}\n\n| ID | P | Feature | Doc |\n| --- | --- | --- | --- |\n`;
  for (const [p, text, doc] of items) out += `| F-${String(++n).padStart(3, "0")} | ${p} | ${text} | [${doc}](${fs.readdirSync(path.join(__dirname, "..")).find((f) => f.startsWith(doc))}) |\n`;
  out += "\n";
}
const features = n;
const sections = {};
for (const w of catalogue) (sections[w.section] ??= []).push(w);
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let m = 0;
const tally = { P1: 0, P2: 0, P3: 0 };
out += `## Widgets\n\nAll ${catalogue.length} from the catalogue.\n\n| ID | P | Widget | Category |\n| --- | --- | --- | --- |\n`;
for (const [section, items] of Object.entries(sections)) {
  for (const w of items) {
    const p = priority(w);
    tally[p]++;
    out += `| W-${String(++m).padStart(3, "0")} | ${p} | ${name(w)} | [${section}](widgets/${slug(section)}.md) |\n`;
  }
}
out += `\nTotals: ${features} features and ${m} widgets (${tally.P1} P1, ${tally.P2} P2, ${tally.P3} P3). Extra tiles not in the catalogue are G-14.\n`;
fs.writeFileSync(path.join(__dirname, "..", "15-feature-checklist.md"), out);
console.log({ features, widgets: m, ...tally });
