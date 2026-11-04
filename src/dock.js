// The dock bar. This window also owns the background jobs (pomodoro finish,
// auto-pause before meetings).

let settings = getSettings();
const data = {
  stats: null,
  media: null,
  weather: null,
  calendar: null,
  claude: null,
  stripe: null,
  contributions: null,
};

document.addEventListener("contextmenu", (e) => e.preventDefault());

const $ = (id) => document.getElementById(id);

function showPanel(name, el) {
  const rect = el.getBoundingClientRect();
  invoke("show_panel", { name, x: rect.left + rect.width / 2 });
}

// Rebuilds an element only when its content changes, so hover states and
// clicks survive the once-a-second refresh.
function renderInto(el, key, build) {
  const serialized = JSON.stringify(key);
  if (el.dataset.key === serialized) return;
  el.dataset.key = serialized;
  el.replaceChildren(...build().filter(Boolean));
}

// Keeps the window exactly as wide as the bar, so the desktop on either side
// of it stays clickable.
document.documentElement.style.setProperty("--max-bar", `${screen.width - 16}px`);
new ResizeObserver(() => {
  invoke("set_dock_width", { width: $("bar").getBoundingClientRect().width });
}).observe($("bar"));

$("start").addEventListener("click", () => invoke("open_start"));
$("more").append(icon("chevron"));
for (const [id, panel] of [
  ["claude", "claude"],
  ["stripe", "stripe"],
  ["github", "github"],
  ["battery", "stats"],
  ["more", "more"],
]) {
  $(id).addEventListener("click", (e) => showPanel(panel, e.currentTarget));
}
$("clock").addEventListener("click", (e) => {
  const wantsWeather = e.target.closest(".clock-temp") && settings.city;
  showPanel(wantsWeather ? "weather" : "calendar", e.currentTarget);
});

// ------------------------------------------------------------------ toast

const toastEl = $("toast");
let toastTimer = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 6000);
}

function beep() {
  const audio = new AudioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
  osc.frequency.value = 880;
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.6);
  osc.onended = () => audio.close();
}

// ------------------------------------------------------------------- apps

// A dot marks a running app. Pinned apps that aren't running follow, without one.
const appButtons = new Map();
const appOrder = new Map(); // hwnd -> first-seen rank; z-order would reshuffle on every focus change
let nextAppRank = 0;
let runningExes = new Set();

function appImage(win) {
  return win.icon
    ? h("img", { src: win.icon, alt: "" })
    : h("span", { class: "fallback" }, (win.title[0] ?? "?").toUpperCase());
}

function togglePin(win) {
  if (!win.exe) return;
  const pins = read("pins", []);
  const pinned = pins.some((p) => p.exe === win.exe);
  const name = pinName(win.exe);
  save("pins", pinned ? pins.filter((p) => p.exe !== win.exe) : [...pins, { exe: win.exe, title: name, icon: win.icon }]);
  toast(pinned ? `Unpinned ${name}` : `Pinned ${name}`);
  renderPins();
}

function pinName(exe) {
  return exe.split("\\").pop().replace(/\.exe$/i, "");
}

function appButton(win) {
  const button = h("button", {
    class: "app is-running",
    onclick: () => invoke("focus_window", { hwnd: win.hwnd }).then(refreshApps),
    oncontextmenu: () => togglePin(win),
  });
  button.append(appImage(win));
  return button;
}

function renderPins() {
  const pins = read("pins", []).filter((p) => !runningExes.has(p.exe));
  renderInto($("pinned"), pins.map((p) => p.exe), () =>
    pins.map((pin) => {
      const button = h("button", {
        class: "app",
        title: pin.title,
        onclick: () => invoke("launch_app", { exe: pin.exe }).catch((e) => toast(String(e))),
        oncontextmenu: () => togglePin(pin),
      });
      button.setAttribute("aria-label", pin.title);
      button.append(appImage(pin));
      return button;
    }),
  );
}

async function refreshApps() {
  const windows = await invoke("list_windows");
  const alive = new Set(windows.map((w) => w.hwnd));
  for (const [hwnd, button] of appButtons) {
    if (!alive.has(hwnd)) {
      button.remove();
      appButtons.delete(hwnd);
      appOrder.delete(hwnd);
    }
  }
  for (const win of windows) {
    if (!appOrder.has(win.hwnd)) appOrder.set(win.hwnd, nextAppRank++);
  }
  windows.sort((a, b) => appOrder.get(a.hwnd) - appOrder.get(b.hwnd));
  for (const win of windows) {
    let button = appButtons.get(win.hwnd);
    if (!button) {
      button = appButton(win);
      appButtons.set(win.hwnd, button);
      $("running").append(button);
    }
    button.title = win.title;
    button.setAttribute("aria-label", win.title);
    button.classList.toggle("active", win.active);
  }
  runningExes = new Set(windows.map((w) => w.exe));
  renderPins();
}

// ----------------------------------------------------------------- tiles

function usageRow(label, win, left) {
  const bar = h("div", { class: `usage-bar ${usageLevel(win?.percent)}` });
  bar.append(h("div", { style: `width:${win?.percent ?? 0}%` }));
  return [
    h("b", null, label),
    bar,
    h("span", { class: "left" }, left),
    h("span", { class: "pct" }, win ? `${Math.round(win.percent)}%` : "–"),
  ];
}

function renderClaude() {
  const el = $("claude");
  el.hidden = !settings.widgets.claude;
  if (el.hidden) return;
  const now = Date.now();
  const claude = data.claude;
  const session = claudeWindow(claude?.usage?.five_hour, now);
  const weekly = claudeWindow(claude?.usage?.seven_day, now);
  const sessionLeft = session?.resetsAt ? formatDuration(session.resetsAt - now) : "";
  const weeklyLeft = weekly?.resetsAt ? formatResetDay(weekly.resetsAt) : "";
  const hasData = session || weekly;
  const key = [session?.percent, weekly?.percent, sessionLeft, weeklyLeft, claude?.connected];
  renderInto(el, key, () => {
    const tile = h("div", { class: "claude-icon" });
    tile.append(icon("claude"));
    if (!hasData) {
      return [
        tile,
        h(
          "div",
          { class: "connect-hint" },
          h("b", null, "Claude usage"),
          h("span", null, claude?.connected ? "Waiting for Claude Code…" : "Click to connect"),
        ),
      ];
    }
    return [
      tile,
      h(
        "div",
        { class: "usage-rows" },
        usageRow("Session", session, sessionLeft),
        usageRow("Weekly", weekly, weeklyLeft),
      ),
    ];
  });
}

function renderStripe() {
  const el = $("stripe");
  const on = settings.widgets.stripe && settings.stripeKey;
  el.hidden = !on;
  if (!on) return;
  const chart = data.stripe?.chart;
  el.title = "Net revenue, last 7 days";
  const up = (chart?.change ?? 0) >= 0;
  renderInto(el, [chart], () => [
    h(
      "div",
      { class: "chart-head" },
      h("span", { class: "chart-badge" }, "S"),
      h("span", null, "Net revenue"),
      h("span", { class: "amount" }, chart ? formatMoney(chart.week, chart.currency, 0) : "–"),
    ),
    chart?.change !== null && chart?.change !== undefined &&
      h("span", { class: up ? "chart-change" : "chart-change down" }, `${up ? "▲" : "▼"} ${Math.abs(chart.change)}%`),
    sparkline(chart?.daily ?? [], up ? "#30d158" : "#ff453a"),
  ]);
}

function renderGithub() {
  const el = $("github");
  const on = settings.widgets.github && settings.githubUser;
  el.hidden = !on;
  if (!on) return;
  const days = data.contributions;
  const stats = days ? contributionStats(days) : null;
  const stat = (value, label) => h("span", null, h("b", null, String(value ?? "–")), ` ${label}`);
  renderInto(el, [stats, days?.slice(-GRID_DAYS).map((d) => d.level)], () => [
    h(
      "div",
      { class: "github-stats" },
      stat(stats?.today, "today"),
      stat(stats?.week, "week"),
      h("span", null, "🔥", h("b", null, ` ${stats?.streak ?? "–"}`), " streak"),
    ),
    contributionGrid(days ?? []),
  ]);
}

function renderClock() {
  const now = new Date();
  const parts = clockParts(now, settings.hour24);
  const weekday = now.toLocaleDateString([], { weekday: "short" }).replace(".", "");
  const w = settings.widgets.weather && settings.city ? data.weather : null;
  const temp = w ? `${Math.round(w.temp)}°` : "–";
  renderInto($("clock"), [parts, weekday, now.getDate(), temp], () => [
    h("span", { class: "clock-time" }, parts.time, parts.suffix && h("small", null, ` ${parts.suffix}`)),
    h("span", { class: "clock-day" }, weekday, h("b", null, String(now.getDate()))),
    h("span", { class: "clock-temp", title: w ? weatherInfo(w.code).label : "" }, temp),
  ]);
}

function renderBattery() {
  const el = $("battery");
  const battery = settings.bar.battery ? data.stats?.battery : null;
  el.hidden = !battery;
  if (!battery) return;
  const [percent, charging] = battery;
  el.title = charging ? `${percent}%, plugged in` : `${percent}%, on battery`;
  el.classList.toggle("low", percent <= 20 && !charging);
  renderInto(el, [percent, charging], () => {
    const water = h("div", { class: "water", style: `height:${percent}%` });
    water.innerHTML =
      '<svg class="wave" viewBox="0 0 56 5" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 3C9 0 19 0 28 2.5S47 5 56 2V5H0Z"/></svg>';
    return [water, h("div", { class: "level" }, charging && icon("bolt"), h("span", null, String(percent)))];
  });
}

// Tiles made on demand contain their own buttons, so they can't be buttons.
function clickableTile(className, panel, ...children) {
  const tile = h("div", { class: `tile ${className}`, role: "button", tabIndex: 0 }, ...children);
  tile.addEventListener("click", () => showPanel(panel, tile));
  return tile;
}

function roundButton(iconName, label, className, onClick) {
  const button = h("button", {
    class: `round-btn ${className}`,
    title: label,
    onclick: (e) => {
      e.stopPropagation();
      onClick();
    },
  });
  button.setAttribute("aria-label", label);
  button.append(icon(iconName));
  return button;
}

function mediaCommand(cmd) {
  invoke("media_cmd", { cmd }).then(() => setTimeout(refreshMedia, 300));
}

function mediaTile(media) {
  const art = h("div", { class: "media-art" });
  art.append(icon("music"));
  return clickableTile(
    "media",
    "media",
    art,
    h("div", { class: "media-text" }, h("b", null, media.title), media.artist && h("span", null, media.artist)),
    h(
      "div",
      { class: "media-controls" },
      roundButton("prev", "Previous", "", () => mediaCommand("prev")),
      roundButton(media.playing ? "pause" : "play", media.playing ? "Pause" : "Play", "blue", () => mediaCommand("toggle")),
      roundButton("next", "Next", "", () => mediaCommand("next")),
    ),
  );
}

function pomodoroTile(p) {
  return clickableTile(
    "pomodoro",
    "pomodoro",
    h(
      "div",
      null,
      h("div", { class: "label" }, p.mode === "work" ? "Focus" : "Break"),
      h("div", { class: "count" }, formatClock(pomodoroRemaining(p))),
    ),
    roundButton(p.running ? "pause" : "play", p.running ? "Pause" : "Start", "red", () => {
      togglePomodoro();
      renderExtras();
    }),
  );
}

function nextEvent() {
  const now = Date.now();
  return data.calendar?.events.find((e) => e.end > now || e.start > now);
}

function eventWhen(event, now) {
  if (event.allDay) return "All day";
  const time = formatTime(event.start, settings.hour24);
  if (event.start <= now) return `Now · until ${formatTime(event.end, settings.hour24)}`;
  if (startOfDay(event.start) === startOfDay(now)) {
    const left = formatDuration(event.start - now);
    return `${time} · in ${left.replace(/^(\d+)m$/, "$1 min")}`;
  }
  return `${time} · ${new Date(event.start).toLocaleDateString([], { weekday: "short" })}`;
}

function eventTile(event, now) {
  const day = new Date(event.start > now ? event.start : now);
  const weekday = day.toLocaleDateString([], { weekday: "short" }).replace(".", "");
  return clickableTile(
    "next-up",
    "calendar",
    h("div", { class: "date-tile" }, h("small", null, weekday), h("b", null, String(day.getDate()))),
    h("div", { class: "stack" }, h("b", null, event.title), h("span", null, eventWhen(event, now))),
  );
}

function statsTile(stats) {
  const memory = (stats.mem_used / stats.mem_total) * 100;
  return clickableTile(
    "stats",
    "stats",
    ring(stats.cpu, "#0a84ff", Math.round(stats.cpu), "CPU"),
    ring(memory, "#0a84ff", Math.round(memory), "RAM"),
  );
}

function todoTile(todos) {
  const open = todos.filter((t) => !t.done);
  const done = todos.length ? ((todos.length - open.length) / todos.length) * 100 : 0;
  return clickableTile(
    "todo-next",
    "todos",
    ring(done, "#0a84ff", open.length),
    h("span", null, open[0]?.text ?? "All done"),
  );
}

function noteTile(notes) {
  const [first, ...rest] = (notes[0]?.text ?? "").split("\n");
  return clickableTile(
    "note-tile",
    "notes",
    h("div", { class: "note-pad" }),
    h(
      "div",
      { class: "stack" },
      h("b", null, first || "Notes"),
      h("span", null, rest.join(" ") || (notes.length ? "" : "Nothing yet")),
    ),
  );
}

function renderExtras() {
  const now = Date.now();
  const p = getPomodoro();
  const media = settings.widgets.media && data.media?.playing ? data.media : null;
  const showTimer = settings.widgets.pomodoro && (p.running || settings.bar.pomodoro);
  const event = nextEvent();
  const stats = settings.bar.stats ? data.stats : null;
  const todos = settings.bar.todos ? read("todos", []) : null;
  const notes = settings.bar.notes ? read("notes", []) : null;
  const key = [
    media,
    showTimer && [p.mode, p.running, formatClock(pomodoroRemaining(p))],
    event && [event.id, eventWhen(event, now)],
    stats && [Math.round(stats.cpu), Math.round(stats.mem_used / 1e8)],
    todos,
    notes,
  ];
  renderInto($("extras"), key, () => [
    media && mediaTile(media),
    showTimer && pomodoroTile(p),
    event && eventTile(event, now),
    stats && statsTile(stats),
    todos && todoTile(todos),
    notes && noteTile(notes),
  ]);
}

function renderAll() {
  renderClaude();
  renderStripe();
  renderGithub();
  renderExtras();
  renderBattery();
  renderClock();
}

// ------------------------------------------------------------------- jobs

async function refreshStats() {
  data.stats = await invoke("sys_stats");
  renderBattery();
  renderExtras();
}

async function refreshMedia() {
  data.media = settings.widgets.media ? await invoke("media_info") : null;
  renderExtras();
}

async function refreshClaude() {
  data.claude = await invoke("claude_usage");
  renderClaude();
}

async function refreshRemote() {
  const s = settings;
  const [weather, calendar, stripe, contributions] = await Promise.allSettled([
    s.widgets.weather && s.city ? loadWeather(s) : null,
    icalUrls(s).length ? loadCalendar(s) : null,
    s.widgets.stripe && s.stripeKey ? loadStripe(s) : null,
    s.widgets.github && s.githubUser ? loadContributions(s) : null,
  ]);
  data.weather = weather.value?.value ?? null;
  data.calendar = calendar.value?.value ?? null;
  data.stripe = stripe.value?.value ?? null;
  data.contributions = contributions.value?.value ?? null;
  renderAll();
}

function finishPomodoro() {
  const p = getPomodoro();
  if (!p.running || p.endsAt > Date.now()) return;
  const finished = p.mode;
  const mode = finished === "work" ? "break" : "work";
  save("pomodoro", { ...p, mode, running: false, endsAt: 0, remaining: null });
  toast(finished === "work" ? "Focus session done. Time for a break." : "Break over. Ready to focus?");
  beep();
}

const pausedFor = new Set();

// Pauses media once per meeting, when a timed event starts within a minute.
async function autoPauseForMeetings() {
  if (!settings.autoPause || !data.calendar) return;
  const now = Date.now();
  const upcoming = data.calendar.events.find(
    (e) => !e.allDay && !pausedFor.has(e.id) && e.start >= now && e.start - now <= 60000,
  );
  if (!upcoming) return;
  const media = await invoke("media_info");
  if (!media?.playing) return;
  pausedFor.add(upcoming.id);
  await invoke("media_cmd", { cmd: "pause" });
  toast(`Paused for ${upcoming.title}`);
  refreshMedia();
}

onDataChanged(() => {
  settings = getSettings();
  renderAll();
  renderPins();
  refreshRemote();
  refreshMedia();
  refreshClaude();
});

function every(ms, job) {
  const run = () => Promise.resolve(job()).catch((e) => console.error(e));
  run();
  setInterval(run, ms);
}

every(1000, () => {
  finishPomodoro();
  renderAll();
});
every(1500, refreshApps);
every(2000, refreshStats);
every(3000, refreshMedia);
every(5000, refreshClaude);
every(60000, refreshRemote);
every(30000, autoPauseForMeetings);
