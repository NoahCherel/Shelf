// Shared by the dock and panel windows: storage, API fetchers, iCal parsing.

const { invoke } = window.__TAURI__.core;
const { emit, listen } = window.__TAURI__.event;

const WINDOW_ID = location.pathname.includes("panel") ? "panel" : "dock";
const DAY = 86400000;

// --------------------------------------------------------------- storage

const PREFIX = "shelf:";
const CACHE_PREFIX = PREFIX + "cache:";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

function notifyChanged() {
  return emit("data-changed", { from: WINDOW_ID });
}

function save(key, value) {
  write(key, value);
  notifyChanged();
}

// Windows ignore their own saves: they've already updated, and re-rendering
// would wipe out whatever the user is typing.
function onDataChanged(fn) {
  return listen("data-changed", (e) => {
    if (e.payload?.from !== WINDOW_ID) fn();
  });
}

const DEFAULT_SETTINGS = {
  city: "",
  hour24: new Intl.DateTimeFormat([], { hour: "numeric" }).resolvedOptions().hour12 === false,
  githubUser: "",
  githubToken: "",
  stripeKey: "",
  openaiKey: "",
  deepseekKey: "",
  budget: 0,
  icalUrls: "",
  autoPause: true,
  autostart: false,
  // Extra tiles to keep in the bar. The rest of each widget stays under More.
  bar: {
    battery: false,
    pomodoro: false,
    stats: false,
    todos: false,
    notes: false,
  },
  widgets: {
    claude: true,
    media: true,
    pomodoro: true,
    todos: true,
    notes: true,
    weather: true,
    stats: true,
    github: true,
    stripe: true,
    spend: true,
  },
};

function getSettings() {
  const saved = read("settings", {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    bar: { ...DEFAULT_SETTINGS.bar, ...saved.bar },
    widgets: { ...DEFAULT_SETTINGS.widgets, ...saved.widgets },
  };
}

function clearCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
  }
}

const inflight = new Map();
const RETRY_AFTER = 60000;

// Returns { value, error, at }. A failed refresh keeps the last good value and
// is retried after a minute, so a bad key can't hammer an API.
function cached(key, ttl, fetcher, force = false) {
  const storageKey = "cache:" + key;
  const entry = read(storageKey, null);
  if (entry && !force && Date.now() < entry.expires) return Promise.resolve(entry);
  if (inflight.has(key)) return inflight.get(key);

  const request = fetcher()
    .then((value) => ({ value, error: null, at: Date.now(), expires: Date.now() + ttl }))
    .catch((e) => ({
      value: entry?.value ?? null,
      error: String(e?.message ?? e),
      at: entry?.at ?? null,
      expires: Date.now() + RETRY_AFTER,
    }))
    .then((next) => {
      inflight.delete(key);
      save(storageKey, next);
      return next;
    });
  inflight.set(key, request);
  return request;
}

// ---------------------------------------------------------------- helpers

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat(2).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const ICON_PATHS = {
  logo: '<rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="11" height="4" rx="1.5"/><rect x="3" y="16" width="18" height="4" rx="1.5"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 2v4M14 2v4M10 18v4M14 18v4M2 10h4M2 14h4M18 10h4M18 14h4"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 3-3 3.5-6 3.5H8"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  spark: '<path d="M12 3c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L3 9.5M3 4v5.5h5.5M4 13a8 8 0 0 0 14 4.5l3-3M21 20v-5.5h-5.5"/>',
  chevron: '<path d="m6 15 6-6 6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  bolt: '<path d="M13.5 2 4 14h7l-1 8 10-13h-7z"/>',
  claude: '<path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7M7.5 3.3l9 17.4M16.5 3.3l-9 17.4M3.3 7.5l17.4 9M20.7 7.5l-17.4 9"/>',
  prev: '<path d="M18 6v12l-9-6zM6 6v12"/>',
  next: '<path d="M6 6v12l9-6zM18 6v12"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
};

function icon(name) {
  const template = document.createElement("template");
  template.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  return template.content.firstChild;
}

function formatTime(ms, hour24) {
  return new Date(ms).toLocaleTimeString([], {
    hour: hour24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: !hour24,
  });
}

function formatMoney(amount, currency = "USD", digits) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// The time and its AM/PM apart, since tiles draw the suffix smaller.
function clockParts(date, hour24) {
  const parts = new Intl.DateTimeFormat([], {
    hour: hour24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: !hour24,
  }).formatToParts(date);
  const suffix = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return { time, suffix };
}

// Only ever given numbers, colours from the code and generated ids.
function sparkline(values, color) {
  const width = 140;
  const height = 26;
  const top = 3;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values.map((v, i) => {
    const x = 8 + (i * (width - 16)) / Math.max(1, values.length - 1);
    const y = height - 3 - ((v - min) / Math.max(1e-9, max - min)) * (height - 3 - top);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");
  const last = points[points.length - 1];
  const id = `spark${(sparkline.count = (sparkline.count ?? 0) + 1)}`;
  const template = document.createElement("template");
  template.innerHTML =
    `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
    (last
      ? `<path d="${line}L${last[0]} ${height}L${points[0][0]} ${height}Z" fill="url(#${id})"/>` +
        `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<circle cx="${last[0]}" cy="${last[1]}" r="1.8" fill="${color}"/>`
      : "") +
    "</svg>";
  return template.content.firstChild;
}

function ring(percent, color, value, label) {
  const circumference = 2 * Math.PI * 14;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const el = h("div", { class: "ring" });
  el.innerHTML =
    '<svg viewBox="0 0 34 34" aria-hidden="true">' +
    '<circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2.5"/>' +
    `<circle cx="17" cy="17" r="14" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}"/>` +
    "</svg>";
  el.append(h("div", { class: "value" }, String(value), label && h("small", null, label)));
  return el;
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function utcMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function openSettings() {
  invoke("show_panel", { name: "settings", x: 1e6 });
}

// ----------------------------------------------------------- Claude limits

const FIVE_HOURS = 5 * 3600000;
const SEVEN_DAYS = 7 * DAY;

// A window that has already reset starts again from zero, even if Claude Code
// hasn't run since to report it.
function claudeWindow(raw, now = Date.now()) {
  if (!raw) return null;
  const resetsAt = raw.resets_at * 1000;
  if (resetsAt <= now) return { percent: 0, resetsAt: null };
  return { percent: Math.min(100, Math.max(0, raw.used_percentage)), resetsAt };
}

function usageLevel(percent = 0) {
  if (percent >= 90) return "full";
  return percent >= 70 ? "warn" : "";
}

// Straight-line projection. Null early in a window, when there's too little
// to go on.
function claudePace(win, length, now = Date.now()) {
  if (!win?.resetsAt || win.percent <= 0) return null;
  const elapsed = length - (win.resetsAt - now);
  if (elapsed < length * 0.05) return null;
  const projected = (win.percent * length) / elapsed;
  if (projected < 100) return { hitsLimitAt: null, projected };
  return { hitsLimitAt: now + ((100 - win.percent) * elapsed) / win.percent, projected };
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatResetDay(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString([], { weekday: "short" }).replace(".", "")} ${d.getDate()}`;
}

// --------------------------------------------------------------- pomodoro

function getPomodoro() {
  return {
    mode: "work",
    running: false,
    endsAt: 0,
    remaining: null,
    workMin: 25,
    breakMin: 5,
    ...read("pomodoro", {}),
  };
}

function pomodoroLength(p, mode = p.mode) {
  return (mode === "work" ? p.workMin : p.breakMin) * 60000;
}

function pomodoroRemaining(p) {
  if (p.running) return Math.max(0, p.endsAt - Date.now());
  return p.remaining ?? pomodoroLength(p);
}

function togglePomodoro() {
  const p = getPomodoro();
  save(
    "pomodoro",
    p.running
      ? { ...p, running: false, endsAt: 0, remaining: pomodoroRemaining(p) }
      : { ...p, running: true, endsAt: Date.now() + pomodoroRemaining(p), remaining: null },
  );
}

// --------------------------------------------------------------- fetchers

async function api(method, url, headers = {}, body = null) {
  const res = await invoke("http_request", { method, url, headers, body });
  if (res.status < 200 || res.status >= 300) {
    let detail = "";
    try {
      const parsed = JSON.parse(res.body);
      detail = parsed.error?.message ?? parsed.message ?? parsed.reason ?? "";
    } catch {}
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.body;
}

async function apiJson(url, headers) {
  return JSON.parse(await api("GET", url, headers));
}

const WEATHER_CODES = [
  [[0], "Clear", "☀️"],
  [[1, 2], "Partly cloudy", "⛅"],
  [[3], "Overcast", "☁️"],
  [[45, 48], "Fog", "🌫️"],
  [[51, 53, 55, 56, 57], "Drizzle", "🌦️"],
  [[61, 63, 65, 66, 67], "Rain", "🌧️"],
  [[71, 73, 75, 77], "Snow", "🌨️"],
  [[80, 81, 82], "Showers", "🌦️"],
  [[85, 86], "Snow showers", "🌨️"],
  [[95, 96, 99], "Thunderstorm", "⛈️"],
];

function weatherInfo(code) {
  const match = WEATHER_CODES.find(([codes]) => codes.includes(code));
  return match ? { label: match[1], glyph: match[2] } : { label: "Unknown", glyph: "🌡️" };
}

async function fetchWeather(city) {
  const geo = await apiJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`City not found: ${city}`);
  const data = await apiJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7",
  );
  const thisHour = data.current.time.slice(0, 13);
  const first = Math.max(0, data.hourly.time.findIndex((t) => t.slice(0, 13) === thisHour));
  return {
    place: [place.name, place.country].filter(Boolean).join(", "),
    unit: data.current_units.temperature_2m,
    temp: data.current.temperature_2m,
    code: data.current.weather_code,
    hourly: data.hourly.time.slice(first, first + 12).map((time, i) => ({
      hour: time.slice(11, 16),
      temp: data.hourly.temperature_2m[first + i],
      code: data.hourly.weather_code[first + i],
    })),
    daily: data.daily.time.map((date, i) => ({
      date,
      max: data.daily.temperature_2m_max[i],
      min: data.daily.temperature_2m_min[i],
      code: data.daily.weather_code[i],
    })),
  };
}

function describeGithubEvent(e) {
  const p = e.payload ?? {};
  switch (e.type) {
    case "PushEvent":
      return `Pushed to ${(p.ref ?? "").replace("refs/heads/", "")}`;
    case "PullRequestEvent":
      return `${p.action} PR #${p.number ?? p.pull_request?.number}`;
    case "IssuesEvent":
      return `${p.action} issue #${p.issue?.number}`;
    case "IssueCommentEvent":
      return `Commented on #${p.issue?.number}`;
    case "CreateEvent":
      return `Created ${p.ref_type}${p.ref ? ` ${p.ref}` : ""}`;
    case "DeleteEvent":
      return `Deleted ${p.ref_type} ${p.ref}`;
    case "WatchEvent":
      return "Starred";
    case "ForkEvent":
      return "Forked";
    case "ReleaseEvent":
      return `${p.action} release ${p.release?.tag_name ?? ""}`;
    default:
      return e.type.replace(/Event$/, "");
  }
}

// Push events no longer carry a commit count, only the before/head SHAs, so
// each of today's pushes is measured with the compare API. A push's count
// never changes, so it's remembered by event id.
async function countPushCommits(pushes, headers) {
  const known = read("github-push-commits", {});
  const next = {};
  let lookups = 0;
  let total = 0;
  for (const e of pushes) {
    let count = known[e.id];
    if (count === undefined && lookups < 20) {
      lookups++;
      try {
        const cmp = await apiJson(
          `https://api.github.com/repos/${e.repo.name}/compare/${e.payload.before}...${e.payload.head}`,
          headers,
        );
        count = cmp.total_commits;
      } catch {}
    }
    if (count !== undefined) next[e.id] = count;
    total += count ?? 1;
  }
  write("github-push-commits", next);
  return total;
}

async function fetchGithub(user, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const events = await apiJson(
    `https://api.github.com/users/${encodeURIComponent(user)}/events?per_page=100`,
    headers,
  );
  const today = startOfDay();
  const pushes = events.filter(
    (e) => e.type === "PushEvent" && new Date(e.created_at).getTime() >= today,
  );
  return {
    commitsToday: await countPushCommits(pushes, headers),
    events: events.slice(0, 30).map((e) => ({
      id: e.id,
      repo: e.repo.name,
      text: describeGithubEvent(e),
      at: new Date(e.created_at).getTime(),
    })),
  };
}

// The public contribution calendar: per-day counts, with no token needed. Private
// work only counts if the profile shows private contributions.
function parseContributions(html) {
  const counts = new Map();
  for (const [, id, text] of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    const match = /^([\d,]+) contribution/.exec(text.trim());
    counts.set(id, match ? Number(match[1].replace(/,/g, "")) : 0);
  }
  const days = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const date = /data-date="([\d-]+)"/.exec(tag)?.[1];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1] ?? 0);
    if (date) days.push({ date, level, count: counts.get(id) ?? 0 });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(ms = Date.now()) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A day with nothing yet doesn't break the streak until it's over.
function contributionStats(days, today = localDateKey()) {
  const past = days.filter((d) => d.date <= today);
  const todayCount = past[past.length - 1]?.date === today ? past[past.length - 1].count : 0;
  const week = past.slice(-7).reduce((sum, d) => sum + d.count, 0);
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].count > 0) streak++;
    else if (past[i].date !== today) break;
  }
  return { today: todayCount, week, streak };
}

const GRID_DAYS = 39; // 13 columns of 3

function contributionGrid(days, today = localDateKey()) {
  const recent = days.filter((d) => d.date <= today).slice(-GRID_DAYS);
  const cells = [
    ...Array(Math.max(0, GRID_DAYS - recent.length)).fill({ level: 0, count: 0, date: "" }),
    ...recent,
  ];
  return h(
    "div",
    { class: "contrib-grid" },
    cells.map((d) => h("i", { class: `l${d.level}`, title: d.date ? `${d.date}: ${d.count}` : "" })),
  );
}

async function fetchContributions(user) {
  const html = await api("GET", `https://github.com/users/${encodeURIComponent(user)}/contributions`);
  const days = parseContributions(html);
  if (!days.length) throw new Error("No contribution data found");
  return days;
}

// Stripe amounts are in the currency's minor unit (cents, or whole yen).
function minorUnitDigits(currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits;
  } catch {
    return 2;
  }
}

function sumCharges(charges, todayStartSec) {
  const totals = {};
  for (const c of charges) {
    if (c.status !== "succeeded" || c.refunded) continue;
    const net = c.amount - (c.amount_refunded ?? 0);
    const t = (totals[c.currency] ??= { today: 0, month: 0, count: 0 });
    t.month += net;
    t.count += 1;
    if (c.created >= todayStartSec) t.today += net;
  }
  return Object.entries(totals)
    .map(([code, t]) => {
      const currency = code.toUpperCase();
      const unit = 10 ** minorUnitDigits(currency);
      return { currency, today: t.today / unit, month: t.month / unit, count: t.count };
    })
    .sort((a, b) => b.month - a.month);
}

// Fourteen days of net revenue in the busiest currency, and how this week
// compares with the one before.
function chargeChart(charges, todayStart) {
  const byCurrency = {};
  for (const c of charges) {
    if (c.status !== "succeeded" || c.refunded) continue;
    const daysAgo = Math.floor((todayStart + DAY - 1 - c.created * 1000) / DAY);
    if (daysAgo < 0 || daysAgo > 13) continue;
    const daily = (byCurrency[c.currency] ??= Array(14).fill(0));
    daily[13 - daysAgo] += c.amount - (c.amount_refunded ?? 0);
  }
  const sum = (values) => values.reduce((total, v) => total + v, 0);
  const top = Object.entries(byCurrency).sort(([, a], [, b]) => sum(b) - sum(a))[0];
  if (!top) return null;
  const currency = top[0].toUpperCase();
  const unit = 10 ** minorUnitDigits(currency);
  const daily = top[1].map((v) => v / unit);
  const week = sum(daily.slice(7));
  const previous = sum(daily.slice(0, 7));
  return {
    currency,
    daily,
    week,
    change: previous > 0 ? Math.round(((week - previous) / previous) * 100) : null,
  };
}

async function fetchStripe(key) {
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const chartStart = Math.floor((startOfDay() - 13 * DAY) / 1000);
  const since = Math.min(monthStart, chartStart);
  const headers = { Authorization: `Bearer ${key}` };
  const charges = [];
  let after = "";
  for (let page = 0; page < 20; page++) {
    const res = await apiJson(
      `https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100${after}`,
      headers,
    );
    charges.push(...res.data);
    if (!res.has_more || !res.data.length) break;
    after = `&starting_after=${res.data[res.data.length - 1].id}`;
  }
  return {
    totals: sumCharges(charges.filter((c) => c.created >= monthStart), Math.floor(startOfDay() / 1000)),
    chart: chargeChart(charges, startOfDay()),
  };
}

// The cost API returns daily buckets and pages with has_more/next_page.
async function fetchCostPages(baseUrl, headers) {
  const buckets = [];
  let page = "";
  for (let i = 0; i < 12; i++) {
    const res = await apiJson(baseUrl + page, headers);
    buckets.push(...(res.data ?? []));
    if (!res.has_more || !res.next_page) break;
    page = `&page=${encodeURIComponent(res.next_page)}`;
  }
  return buckets;
}

function sumOpenAICost(buckets) {
  let usd = 0;
  for (const bucket of buckets) {
    for (const r of bucket.results ?? []) usd += Number(r.amount?.value) || 0;
  }
  return usd;
}

async function fetchSpend(settings) {
  const start = utcMonthStart();
  const tasks = {};
  if (settings.openaiKey) {
    tasks.openai = fetchCostPages(
      `https://api.openai.com/v1/organization/costs?start_time=${start.getTime() / 1000}&limit=31`,
      { Authorization: `Bearer ${settings.openaiKey}` },
    ).then(sumOpenAICost);
  }
  if (settings.deepseekKey) {
    tasks.deepseek = apiJson("https://api.deepseek.com/user/balance", {
      Authorization: `Bearer ${settings.deepseekKey}`,
    }).then((res) =>
      (res.balance_infos ?? []).map((b) => ({
        currency: b.currency,
        balance: Number(b.total_balance) || 0,
      })),
    );
  }
  const names = Object.keys(tasks);
  const settled = await Promise.allSettled(Object.values(tasks));
  const result = { errors: {} };
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") result[names[i]] = outcome.value;
    else result.errors[names[i]] = String(outcome.reason?.message ?? outcome.reason);
  });
  if (names.length && Object.keys(result.errors).length === names.length) {
    throw new Error(Object.values(result.errors)[0]);
  }
  result.total = result.openai ?? 0;
  return result;
}

// ------------------------------------------------------------------ iCal

function unescapeIcsText(value) {
  return value.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

function parseIcsLine(line) {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const name = line.slice(0, colon).split(";")[0].toUpperCase();
  return { name, value: line.slice(colon + 1) };
}

// Z = UTC; a TZID is treated as local time; a bare date is all-day.
function parseIcsDate(value) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, hh, mi, s] = [m[1], m[2], m[3], m[4] ?? 0, m[5] ?? 0, m[6] ?? 0].map(Number);
  const ms = m[7] ? Date.UTC(y, mo - 1, d, hh, mi, s) : new Date(y, mo - 1, d, hh, mi, s).getTime();
  return { ms, allDay: m[4] === undefined };
}

function parseIcsDuration(value) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [w, d, hh, mi, s] = m.slice(1).map((n) => Number(n ?? 0));
  return (w * 7 + d) * DAY + (hh * 3600 + mi * 60 + s) * 1000;
}

function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let event = null;
  let nested = 0; // VALARM etc. have their own SUMMARY/DESCRIPTION lines
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      event = { uid: "", title: "(no title)", location: "", exdates: [], rrule: null };
      nested = 0;
    } else if (line === "END:VEVENT") {
      if (event?.start !== undefined) events.push(event);
      event = null;
    } else if (event) {
      if (line.startsWith("BEGIN:")) nested++;
      else if (line.startsWith("END:")) nested--;
      else if (nested === 0) applyIcsProperty(event, parseIcsLine(line));
    }
  }
  return events;
}

function applyIcsProperty(event, prop) {
  if (!prop) return;
  const { name, value } = prop;
  if (name === "UID") event.uid = value;
  else if (name === "SUMMARY") event.title = unescapeIcsText(value);
  else if (name === "LOCATION") event.location = unescapeIcsText(value);
  else if (name === "STATUS") event.cancelled = value.trim().toUpperCase() === "CANCELLED";
  else if (name === "RRULE") event.rrule = value;
  else if (name === "DURATION") event.duration = parseIcsDuration(value);
  else if (name === "DTSTART" || name === "DTEND" || name === "RECURRENCE-ID") {
    const date = parseIcsDate(value);
    if (!date) return;
    if (name === "DTSTART") {
      event.start = date.ms;
      event.allDay = date.allDay;
    } else if (name === "DTEND") event.end = date.ms;
    else event.recurrenceId = date.ms;
  } else if (name === "EXDATE") {
    for (const part of value.split(",")) {
      const date = parseIcsDate(part);
      if (date) event.exdates.push(date.ms);
    }
  }
}

function parseRrule(rule) {
  const parts = Object.fromEntries(rule.trim().split(";").map((p) => p.split("=")));
  const until = parts.UNTIL ? parseIcsDate(parts.UNTIL) : null;
  return {
    freq: parts.FREQ,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: until ? until.ms + (until.allDay ? DAY - 1 : 0) : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(",").map((d) => d.slice(-2)) : null,
  };
}

const ICS_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Only DAILY and WEEKLY repeat; anything else shows its first occurrence.
function occurrenceStarts(event, to) {
  const rule = event.rrule ? parseRrule(event.rrule) : null;
  if (!rule || (rule.freq !== "DAILY" && rule.freq !== "WEEKLY")) return [event.start];

  const first = new Date(event.start);
  const dayNumber = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const weekNumber = (n) => Math.floor((n + 3) / 7); // weeks starting on Monday
  const firstDay = dayNumber(first);
  const weekdays = rule.byDay ?? (rule.freq === "WEEKLY" ? [ICS_WEEKDAYS[first.getDay()]] : null);

  const starts = [];
  let seen = 0;
  for (let offset = 0; offset < 40000; offset++) {
    // Rebuilding from local parts keeps the wall-clock time across DST changes.
    const at = new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() + offset,
      first.getHours(),
      first.getMinutes(),
      first.getSeconds(),
    );
    const ms = at.getTime();
    if (ms >= to || (rule.until !== null && ms > rule.until)) break;
    const n = dayNumber(at);
    const onCycle =
      rule.freq === "DAILY"
        ? (n - firstDay) % rule.interval === 0
        : (weekNumber(n) - weekNumber(firstDay)) % rule.interval === 0;
    if (!onCycle || (weekdays && !weekdays.includes(ICS_WEEKDAYS[at.getDay()]))) continue;
    seen++;
    if (rule.count !== null && seen > rule.count) break;
    starts.push(ms);
  }
  return starts;
}

function expandEvents(events, from, to) {
  const moved = new Set(
    events.filter((e) => e.recurrenceId !== undefined).map((e) => `${e.uid}|${e.recurrenceId}`),
  );
  const out = [];
  for (const event of events) {
    if (event.cancelled) continue;
    const length =
      event.end !== undefined ? event.end - event.start : event.duration ?? (event.allDay ? DAY : 0);
    for (const start of occurrenceStarts(event, to)) {
      if (event.exdates.includes(start)) continue;
      if (event.recurrenceId === undefined && moved.has(`${event.uid}|${start}`)) continue;
      const end = start + length;
      if (start >= to || (length ? end <= from : start < from)) continue;
      out.push({
        id: `${event.uid}|${start}`,
        title: event.title,
        location: event.location,
        allDay: !!event.allDay,
        start,
        end,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function icalUrls(settings) {
  return settings.icalUrls
    .split(/\r?\n/)
    .map((u) => u.trim().replace(/^webcal:\/\//i, "https://"))
    .filter(Boolean);
}

async function fetchCalendar(urls) {
  const from = startOfDay();
  const to = from + 14 * DAY;
  const settled = await Promise.allSettled(urls.map((url) => api("GET", url)));
  const events = [];
  const errors = [];
  settled.forEach((outcome) => {
    if (outcome.status === "fulfilled") events.push(...expandEvents(parseIcs(outcome.value), from, to));
    else errors.push(String(outcome.reason?.message ?? outcome.reason));
  });
  if (errors.length && errors.length === urls.length) throw new Error(errors[0]);
  return { events: events.sort((a, b) => a.start - b.start), errors };
}

// ------------------------------------------------- cached widget data

const loadWeather = (s, force) => cached("weather", 30 * 60000, () => fetchWeather(s.city), force);
const loadGithub = (s, force) =>
  cached("github", 5 * 60000, () => fetchGithub(s.githubUser, s.githubToken), force);
const loadContributions = (s, force) =>
  cached("contributions", 30 * 60000, () => fetchContributions(s.githubUser), force);
const loadStripe = (s, force) => cached("stripe", 10 * 60000, () => fetchStripe(s.stripeKey), force);
const loadSpend = (s, force) => cached("spend", 30 * 60000, () => fetchSpend(s), force);
const loadCalendar = (s, force) =>
  cached("calendar", 15 * 60000, () => fetchCalendar(icalUrls(s)), force);
