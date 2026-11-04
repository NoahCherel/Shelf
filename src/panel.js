// The pop-up panel: one window whose contents switch to the clicked widget.

const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");
const refreshBtn = document.getElementById("refresh");
const closeBtn = document.getElementById("close");
const backBtn = document.getElementById("back");

let current = null;
let renderToken = 0;
let tickCount = 0;

refreshBtn.append(icon("refresh"));
closeBtn.append(icon("close"));
backBtn.append(icon("back"));
backBtn.addEventListener("click", () => openPanel("more"));
closeBtn.addEventListener("click", () => invoke("hide_panel"));
refreshBtn.addEventListener("click", () => renderCurrent(true));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") invoke("hide_panel");
});

function note(text) {
  return h("p", { class: "note" }, text);
}

function section(text) {
  return h("div", { class: "section" }, text);
}

function errorLine(text) {
  return h("p", { class: "error" }, text);
}

function settingsLink(text) {
  return h("button", { class: "link", onclick: openSettings }, text);
}

function meter(fraction, warn) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  return h(
    "div",
    { class: warn ? "meter warn" : "meter" },
    h("div", { style: `width:${pct.toFixed(1)}%` }),
  );
}

function dayLabel(ms) {
  const diff = Math.round((startOfDay(ms) - startOfDay()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(ms).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function updatedLine(result) {
  if (!result.at) return null;
  return note(`Updated ${formatTime(result.at, getSettings().hour24)}`);
}

// ---------------------------------------------------------------- panels

function eventRow(event, hour24) {
  const when = event.allDay
    ? "All day"
    : `${formatTime(event.start, hour24)} – ${formatTime(event.end, hour24)}`;
  return h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "grow" },
      h("div", { class: "ellipsis" }, event.title),
      h("div", { class: "muted ellipsis" }, event.location ? `${when} · ${event.location}` : when),
    ),
  );
}

async function renderCalendar(el, force) {
  const s = getSettings();
  const now = new Date();
  el.append(
    h("div", { class: "big" }, formatTime(now.getTime(), s.hour24)),
    h(
      "div",
      { class: "muted" },
      now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    ),
  );
  if (!icalUrls(s).length) {
    el.append(note("Add iCal links to see your upcoming events."), settingsLink("Open settings"));
    return;
  }
  const result = await loadCalendar(s, force);
  if (result.error) el.append(errorLine(`Couldn't load calendar: ${result.error}`));
  for (const error of result.value?.errors ?? []) el.append(errorLine(`One calendar failed: ${error}`));
  const events = result.value?.events ?? [];
  if (result.value && !events.length) el.append(note("Nothing in the next 14 days."));
  let lastDay = null;
  for (const event of events) {
    const day = startOfDay(Math.max(event.start, startOfDay()));
    if (day !== lastDay) {
      el.append(section(dayLabel(day)));
      lastDay = day;
    }
    el.append(eventRow(event, s.hour24));
  }
}

async function renderWeather(el, force) {
  const s = getSettings();
  const result = await loadWeather(s, force);
  if (result.error) el.append(errorLine(`Couldn't load weather: ${result.error}`));
  const w = result.value;
  if (!w) return;
  const info = weatherInfo(w.code);
  el.append(
    h("div", { class: "big" }, `${info.glyph} ${Math.round(w.temp)}${w.unit}`),
    h("div", { class: "muted" }, `${info.label} · ${w.place}`),
    section("Next hours"),
    h(
      "div",
      { class: "hours" },
      w.hourly.map((hour) =>
        h(
          "div",
          { class: "hour" },
          h("div", { class: "muted" }, hour.hour),
          h("div", null, weatherInfo(hour.code).glyph),
          h("div", { class: "num" }, `${Math.round(hour.temp)}°`),
        ),
      ),
    ),
    section("This week"),
    ...w.daily.map((day) => {
      const [y, m, d] = day.date.split("-").map(Number);
      const info = weatherInfo(day.code);
      return h(
        "div",
        { class: "row" },
        h("div", { class: "grow" }, new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long" })),
        h("div", { title: info.label }, info.glyph),
        h("div", { class: "num" }, `${Math.round(day.max)}° / ${Math.round(day.min)}°`),
      );
    }),
    updatedLine(result),
  );
}

function renderStatsContent(el, stats) {
  const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1);
  const mem = stats.mem_used / stats.mem_total;
  el.append(
    section("CPU"),
    h("div", { class: "big" }, `${Math.round(stats.cpu)}%`),
    meter(stats.cpu / 100, stats.cpu > 85),
    section("Memory"),
    h("div", { class: "big" }, `${Math.round(mem * 100)}%`),
    meter(mem, mem > 0.85),
    h("div", { class: "muted num" }, `${gb(stats.mem_used)} of ${gb(stats.mem_total)} GB`),
  );
  if (stats.battery) {
    const [percent, charging] = stats.battery;
    el.append(
      section("Battery"),
      h("div", { class: "big" }, `${percent}%`),
      meter(percent / 100, percent <= 15 && !charging),
      h("div", { class: "muted" }, charging ? "Plugged in" : "On battery"),
    );
  }
}

async function renderStats(el) {
  renderStatsContent(el, await invoke("sys_stats"));
}

async function renderMedia(el) {
  const media = await invoke("media_info");
  if (!media) {
    el.append(note("Nothing is playing."));
    return;
  }
  const command = (cmd) => async () => {
    await invoke("media_cmd", { cmd });
    setTimeout(() => renderCurrent(), 300);
  };
  const control = (name, label, cmd, primary) => {
    const button = h("button", {
      class: primary ? "btn primary" : "btn",
      title: label,
      onclick: command(cmd),
    });
    button.setAttribute("aria-label", label);
    button.append(icon(name));
    return button;
  };
  el.append(
    h("div", { class: "media-title" }, media.title),
    media.artist && h("div", { class: "muted" }, media.artist),
    h(
      "div",
      { class: "btn-row" },
      control("prev", "Previous", "prev"),
      control(media.playing ? "pause" : "play", media.playing ? "Pause" : "Play", "toggle", true),
      control("next", "Next", "next"),
    ),
    media.app && h("div", { class: "muted ellipsis" }, media.app),
  );
}

function renderPomodoro(el) {
  const p = getPomodoro();
  const update = (changes) => {
    save("pomodoro", { ...getPomodoro(), ...changes });
    renderCurrent();
  };
  const start = () => {
    const now = getPomodoro();
    update({ running: true, endsAt: Date.now() + pomodoroRemaining(now), remaining: null });
  };
  const pause = () => update({ running: false, endsAt: 0, remaining: pomodoroRemaining(getPomodoro()) });
  const reset = () => update({ running: false, endsAt: 0, remaining: null });
  const setMode = (mode) => update({ mode, running: false, endsAt: 0, remaining: null });
  const lengthField = (label, key) =>
    h(
      "label",
      { class: "field grow" },
      h("span", null, label),
      h("input", {
        type: "number",
        min: 1,
        max: 180,
        value: p[key],
        onchange: (e) => {
          const minutes = Math.min(180, Math.max(1, Math.round(Number(e.target.value)) || p[key]));
          update({ [key]: minutes });
        },
      }),
    );

  el.append(
    h("div", { class: "muted" }, p.mode === "work" ? "Focus" : "Break"),
    h("div", { class: "big", id: "pomodoro-time" }, formatClock(pomodoroRemaining(p))),
    h(
      "div",
      { class: "btn-row" },
      p.running
        ? h("button", { class: "btn primary", onclick: pause }, "Pause")
        : h("button", { class: "btn primary", onclick: start }, "Start"),
      h("button", { class: "btn", onclick: reset }, "Reset"),
      h(
        "button",
        { class: "btn", onclick: () => setMode(p.mode === "work" ? "break" : "work") },
        p.mode === "work" ? "Switch to break" : "Switch to focus",
      ),
    ),
    section("Lengths in minutes"),
    h("div", { class: "btn-row" }, lengthField("Focus", "workMin"), lengthField("Break", "breakMin")),
  );
}

function renderTodos(el) {
  const todos = read("todos", []);
  const update = (next) => {
    save("todos", next);
    renderCurrent();
  };
  const input = h("input", {
    type: "text",
    placeholder: "Add a to-do and press Enter",
    onkeydown: (e) => {
      const text = e.target.value.trim();
      if (e.key === "Enter" && text) {
        update([...read("todos", []), { id: crypto.randomUUID(), text, done: false }]);
      }
    },
  });
  input.setAttribute("aria-label", "New to-do");
  el.append(input);
  if (!todos.length) el.append(note("Nothing to do."));
  for (const todo of todos) {
    const remove = h("button", {
      class: "icon-btn",
      title: "Delete",
      onclick: () => update(read("todos", []).filter((t) => t.id !== todo.id)),
    });
    remove.setAttribute("aria-label", `Delete ${todo.text}`);
    remove.append(icon("close"));
    el.append(
      h(
        "div",
        { class: "row" },
        h(
          "label",
          { class: "toggle grow" },
          h("input", {
            type: "checkbox",
            checked: todo.done,
            onchange: (e) =>
              update(
                read("todos", []).map((t) => (t.id === todo.id ? { ...t, done: e.target.checked } : t)),
              ),
          }),
          h("span", { class: todo.done ? "done" : "" }, todo.text),
        ),
        remove,
      ),
    );
  }
  if (todos.some((t) => t.done)) {
    el.append(
      h(
        "div",
        { class: "btn-row" },
        h(
          "button",
          { class: "btn", onclick: () => update(read("todos", []).filter((t) => !t.done)) },
          "Clear completed",
        ),
      ),
    );
  }
  requestAnimationFrame(() => input.focus());
}

function renderNotes(el) {
  const notes = read("notes", []);
  const add = () => {
    save("notes", [{ id: crypto.randomUUID(), text: "" }, ...read("notes", [])]);
    renderCurrent();
  };
  el.append(h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: add }, "New note")));
  if (!notes.length) el.append(note("No notes yet."));
  for (const item of notes) {
    const box = h("textarea", {
      value: item.text,
      placeholder: "Write something",
      oninput: (e) =>
        save(
          "notes",
          read("notes", []).map((n) => (n.id === item.id ? { ...n, text: e.target.value } : n)),
        ),
    });
    box.setAttribute("aria-label", "Note");
    el.append(
      box,
      h(
        "div",
        { class: "btn-row" },
        h(
          "button",
          {
            class: "btn danger",
            onclick: () => {
              save("notes", read("notes", []).filter((n) => n.id !== item.id));
              renderCurrent();
            },
          },
          "Delete note",
        ),
      ),
    );
  }
}

async function renderGithub(el, force) {
  const s = getSettings();
  const contributions = await loadContributions(s, force);
  if (contributions.value) {
    const stats = contributionStats(contributions.value);
    el.append(
      h("div", { class: "muted" }, `${stats.today} today · ${stats.week} this week · ${stats.streak} day streak`),
      contributionGrid(contributions.value),
    );
  }
  const result = await loadGithub(s, force);
  if (result.error) el.append(errorLine(`Couldn't load GitHub: ${result.error}`));
  const gh = result.value;
  if (!gh) return;
  el.append(
    h("div", { class: "big" }, String(gh.commitsToday)),
    h("div", { class: "muted" }, gh.commitsToday === 1 ? "commit pushed today" : "commits pushed today"),
    section("Recent activity"),
  );
  if (!gh.events.length) el.append(note("No recent public activity."));
  const hour24 = getSettings().hour24;
  for (const event of gh.events) {
    el.append(
      h(
        "div",
        { class: "row" },
        h(
          "div",
          { class: "grow" },
          h("div", { class: "ellipsis" }, event.text),
          h(
            "button",
            {
              class: "link ellipsis",
              onclick: () => invoke("open_url", { url: `https://github.com/${event.repo}` }),
            },
            event.repo,
          ),
        ),
        h(
          "div",
          { class: "muted num" },
          startOfDay(event.at) === startOfDay()
            ? formatTime(event.at, hour24)
            : new Date(event.at).toLocaleDateString([], { month: "short", day: "numeric" }),
        ),
      ),
    );
  }
  el.append(updatedLine(result));
}

async function renderStripe(el, force) {
  const result = await loadStripe(getSettings(), force);
  if (result.error) el.append(errorLine(`Couldn't load Stripe: ${result.error}`));
  const totals = result.value?.totals;
  if (!totals) return;
  const chart = result.value.chart;
  if (chart) {
    const up = (chart.change ?? 0) >= 0;
    const line = sparkline(chart.daily, up ? "#30d158" : "#ff453a");
    line.style.cssText = "width:100%;height:56px";
    el.append(
      section("Last 7 days"),
      h("div", { class: "big" }, formatMoney(chart.week, chart.currency)),
      chart.change !== null &&
        h("div", { class: "muted" }, `${up ? "▲" : "▼"} ${Math.abs(chart.change)}% on the week before`),
      line,
      section("This month"),
    );
  }
  if (!totals.length) el.append(note("No successful charges this month."));
  for (const t of totals) {
    el.append(
      h("div", { class: "big" }, formatMoney(t.month, t.currency)),
      h("div", { class: "muted" }, `This month · ${t.count} ${t.count === 1 ? "charge" : "charges"}`),
      h("div", { class: "row" }, h("div", { class: "grow" }, "Today"), h("div", { class: "num" }, formatMoney(t.today, t.currency))),
    );
  }
  el.append(updatedLine(result));
}

async function renderSpend(el, force) {
  const s = getSettings();
  const result = await loadSpend(s, force);
  if (result.error) el.append(errorLine(`Couldn't load spend: ${result.error}`));
  const spend = result.value;
  if (!spend) return;
  const costRow = (label, amount, error) =>
    h(
      "div",
      { class: "row" },
      h("div", { class: "grow" }, label),
      error
        ? h("div", { class: "error ellipsis", title: error }, "Failed")
        : h("div", { class: "num" }, formatMoney(amount)),
    );
  if (s.openaiKey) {
    el.append(h("div", { class: "big" }, formatMoney(spend.total)), h("div", { class: "muted" }, "Spent this month"));
    if (s.budget > 0) {
      const used = spend.total / s.budget;
      el.append(
        meter(used, used > 0.8),
        h("div", { class: "muted" }, `${Math.round(used * 100)}% of ${formatMoney(s.budget)} budget`),
      );
    }
    el.append(section("By provider"));
    el.append(costRow("OpenAI", spend.openai, spend.errors.openai));
  }
  if (s.deepseekKey) {
    el.append(section("DeepSeek balance"));
    if (spend.errors.deepseek) el.append(errorLine(spend.errors.deepseek));
    for (const b of spend.deepseek ?? []) {
      el.append(costRow(b.currency, b.balance));
    }
  }
  el.append(updatedLine(result));
}

// ---------------------------------------------------------- Claude limits

function limitBlock(label, win, length, hour24, now) {
  if (!win) {
    return h(
      "div",
      { class: "limit" },
      h("div", { class: "limit-head" }, h("b", null, label), h("span", { class: "pct" }, "–")),
    );
  }
  let resets = "It has reset since Claude Code last reported.";
  if (win.resetsAt) {
    resets =
      length === FIVE_HOURS
        ? `Resets in ${formatDuration(win.resetsAt - now)}`
        : `Resets ${formatResetDay(win.resetsAt)} at ${formatTime(win.resetsAt, hour24)}`;
  }
  const pace = claudePace(win, length, now);
  let paceText = null;
  if (pace?.hitsLimitAt) {
    const early = formatDuration(win.resetsAt - pace.hitsLimitAt);
    paceText = `At this pace you'll reach the limit ${early} before it resets.`;
  } else if (pace) {
    paceText = `At this pace you'll reach about ${Math.round(pace.projected)}% before it resets.`;
  }
  const level = usageLevel(win.percent) || "good";
  return h(
    "div",
    { class: "limit" },
    h(
      "div",
      { class: "limit-head" },
      h("b", null, label),
      h("span", { class: "pct" }, `${Math.round(win.percent)}%`),
    ),
    h("div", { class: `meter ${level}` }, h("div", { style: `width:${win.percent}%` })),
    h("div", { class: "muted" }, resets),
    paceText && h("div", { class: "muted" }, paceText),
  );
}

async function renderClaude(el) {
  const { connected, usage } = await invoke("claude_usage");
  const now = Date.now();
  const hour24 = getSettings().hour24;
  const failure = h("p", { class: "error", hidden: true });
  const setConnected = async (on) => {
    try {
      await invoke("claude_connect", { on });
      notifyChanged();
      renderCurrent();
    } catch (e) {
      failure.textContent = String(e);
      failure.hidden = false;
    }
  };

  if (usage) {
    el.append(
      limitBlock("Session", claudeWindow(usage.five_hour, now), FIVE_HOURS, hour24, now),
      limitBlock("Weekly", claudeWindow(usage.seven_day, now), SEVEN_DAYS, hour24, now),
      note(`Updated ${formatDuration(now - usage.updated_ms)} ago. This refreshes while Claude Code is in use.`),
    );
  }
  if (connected) {
    if (!usage) el.append(note("Connected. Your limits appear after Claude Code's next reply."));
    el.append(
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn", onclick: () => setConnected(false) }, "Disconnect"),
      ),
      failure,
    );
    return;
  }
  el.append(
    note(
      "Shelf reads your limits from Claude Code's status line, so it needs no key and never touches your login.",
    ),
    note(
      "Connecting edits your Claude Code settings to add Shelf to the status line. Your current status line keeps working, a backup is saved, and Disconnect undoes it.",
    ),
    h(
      "div",
      { class: "btn-row" },
      h("button", { class: "btn primary", onclick: () => setConnected(true) }, "Connect to Claude Code"),
    ),
    failure,
  );
}

// ------------------------------------------------------------------- more

async function renderMore(el) {
  const s = getSettings();
  const cachedValue = (key) => read(`cache:${key}`, null)?.value;
  const stats = await invoke("sys_stats");
  const media = s.widgets.media ? await invoke("media_info") : null;
  const p = getPomodoro();
  const github = cachedValue("github");
  const stripe = cachedValue("stripe")?.totals?.[0];
  const spend = cachedValue("spend");
  const memory = Math.round((stats.mem_used / stats.mem_total) * 100);

  const tiles = [
    s.widgets.media && ["media", "music", "Now playing", media?.title ?? "Nothing playing"],
    s.widgets.pomodoro && ["pomodoro", "timer", "Pomodoro", formatClock(pomodoroRemaining(p))],
    s.widgets.todos && ["todos", "check", "To-dos", `${read("todos", []).filter((t) => !t.done).length} open`],
    s.widgets.notes && ["notes", "note", "Notes", `${read("notes", []).length} saved`],
    s.widgets.stats && ["stats", "cpu", "System", `CPU ${Math.round(stats.cpu)}% · RAM ${memory}%`],
    s.widgets.github && s.githubUser && ["github", "git", "GitHub", `${github?.commitsToday ?? "–"} commits today`],
    s.widgets.stripe && s.stripeKey && ["stripe", "money", "Stripe", stripe ? formatMoney(stripe.month, stripe.currency) : "–"],
    s.widgets.spend && (s.openaiKey || s.deepseekKey) && ["spend", "spark", "AI spend", spend ? formatMoney(spend.total) : "–"],
    ["settings", "gear", "Settings", "Widgets and keys"],
  ].filter(Boolean);

  el.append(
    h(
      "div",
      { class: "more-grid" },
      tiles.map(([name, iconName, title, detail]) =>
        h(
          "button",
          { class: "more-tile", onclick: () => goTo(name) },
          icon(iconName),
          h("div", { class: "grow" }, h("b", null, title), h("span", null, detail)),
        ),
      ),
    ),
  );
}

// -------------------------------------------------------------- settings

let settingsChangeTimer = null;

// Keystrokes are stored right away (the panel can close at any moment), but
// refetching waits until typing stops, so partial keys don't hit the APIs.
function saveSetting(changes) {
  write("settings", { ...read("settings", {}), ...changes });
  clearTimeout(settingsChangeTimer);
  settingsChangeTimer = setTimeout(() => {
    clearCache();
    notifyChanged();
  }, 800);
}

const WIDGET_LABELS = {
  claude: "Claude usage",
  media: "Now playing",
  pomodoro: "Pomodoro",
  todos: "To-dos",
  notes: "Notes",
  weather: "Weather",
  stats: "System stats",
  github: "GitHub",
  stripe: "Stripe",
  spend: "AI spend",
};

const BAR_LABELS = {
  battery: "Battery",
  pomodoro: "Pomodoro",
  stats: "CPU and RAM",
  todos: "Next to-do",
  notes: "Latest note",
};

function renderSettings(el) {
  const s = getSettings();
  const textField = (label, key, type = "text", hint) =>
    h(
      "label",
      { class: "field" },
      h("span", null, label),
      h("input", {
        type,
        value: s[key],
        spellcheck: false,
        placeholder: hint ?? "",
        oninput: (e) => saveSetting({ [key]: e.target.value.trim() }),
      }),
    );
  const toggle = (label, checked, onchange) =>
    h(
      "label",
      { class: "toggle" },
      h("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target) }),
      h("span", null, label),
    );
  const autostartError = h("p", { class: "error", hidden: true }, "Couldn't change the startup setting.");

  el.append(
    section("General"),
    textField("City for weather", "city", "text", "Paris"),
    toggle("24-hour clock", s.hour24, (box) => saveSetting({ hour24: box.checked })),
    toggle("Start with Windows", s.autostart, async (box) => {
      const ok = await invoke("set_autostart", { on: box.checked });
      autostartError.hidden = ok;
      if (ok) saveSetting({ autostart: box.checked });
      else box.checked = !box.checked;
    }),
    autostartError,

    section("Widgets"),
    h(
      "div",
      { class: "toggle-grid" },
      Object.entries(WIDGET_LABELS).map(([key, label]) =>
        toggle(label, s.widgets[key], (box) =>
          saveSetting({ widgets: { ...getSettings().widgets, [key]: box.checked } }),
        ),
      ),
    ),

    section("Keep in the bar"),
    h(
      "div",
      { class: "toggle-grid" },
      Object.entries(BAR_LABELS).map(([key, label]) =>
        toggle(label, s.bar[key], (box) =>
          saveSetting({ bar: { ...getSettings().bar, [key]: box.checked } }),
        ),
      ),
    ),

    section("Calendar"),
    h(
      "label",
      { class: "field" },
      h("span", null, "iCal links, one per line"),
      h("textarea", {
        value: s.icalUrls,
        spellcheck: false,
        oninput: (e) => saveSetting({ icalUrls: e.target.value }),
      }),
    ),
    toggle("Pause media before meetings", s.autoPause, (box) => saveSetting({ autoPause: box.checked })),

    section("GitHub"),
    textField("Username", "githubUser"),
    textField("Token (optional)", "githubToken", "password"),

    section("Stripe"),
    textField("Restricted key", "stripeKey", "password"),

    section("AI spend"),
    textField("OpenAI admin key", "openaiKey", "password"),
    textField("DeepSeek key", "deepseekKey", "password"),
    h(
      "label",
      { class: "field" },
      h("span", null, "Monthly budget in USD (0 for none)"),
      h("input", {
        type: "number",
        min: 0,
        value: s.budget,
        oninput: (e) => saveSetting({ budget: Math.max(0, Number(e.target.value) || 0) }),
      }),
    ),
    note("Keys are stored unencrypted on this PC."),

    section("Shelf"),
    h(
      "div",
      { class: "btn-row" },
      h("button", { class: "btn danger", onclick: () => invoke("quit") }, "Quit Shelf"),
      h("span", { class: "muted" }, "Brings the taskbar back."),
    ),
  );
}

// --------------------------------------------------------------- routing

function tickPomodoro() {
  const time = document.getElementById("pomodoro-time");
  const p = getPomodoro();
  if (time) time.textContent = formatClock(pomodoroRemaining(p));
}

const PANELS = {
  claude: { title: "Claude usage", render: renderClaude, every: 30 },
  more: { title: "More", render: renderMore },
  calendar: { title: "Calendar", render: renderCalendar, refreshable: true },
  weather: { title: "Weather", render: renderWeather, refreshable: true },
  stats: { title: "System", render: renderStats, every: 2 },
  media: { title: "Now playing", render: renderMedia, every: 3 },
  pomodoro: { title: "Pomodoro", render: renderPomodoro, tick: tickPomodoro },
  todos: { title: "To-dos", render: renderTodos },
  notes: { title: "Notes", render: renderNotes },
  github: { title: "GitHub", render: renderGithub, refreshable: true },
  stripe: { title: "Stripe", render: renderStripe, refreshable: true },
  spend: { title: "AI spend", render: renderSpend, refreshable: true },
  settings: { title: "Settings", render: renderSettings },
};

async function renderCurrent(force = false) {
  const panel = PANELS[current];
  if (!panel) return;
  const token = ++renderToken;
  const next = h("div");
  try {
    await panel.render(next, force);
  } catch (e) {
    next.append(errorLine(String(e?.message ?? e)));
  }
  if (token === renderToken) contentEl.replaceChildren(next);
}

// Moves within the open panel, keeping a way back to the "more" list.
function goTo(name) {
  openPanel(name);
  backBtn.hidden = false;
}

function openPanel(name) {
  if (!PANELS[name]) return;
  current = name;
  backBtn.hidden = true;
  titleEl.textContent = PANELS[name].title;
  refreshBtn.hidden = !PANELS[name].refreshable;
  contentEl.replaceChildren(note("Loading…"));
  contentEl.scrollTop = 0;
  renderCurrent();
}

listen("open-panel", (e) => openPanel(e.payload));
invoke("current_panel").then((name) => {
  if (name && !current) openPanel(name);
});

// While the panel is hidden there's nothing to keep fresh.
window.addEventListener("blur", () => {
  current = null;
});

onDataChanged(() => {
  // Never re-render under someone typing.
  const editing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (current && !editing) renderCurrent();
});

setInterval(() => {
  const panel = PANELS[current];
  if (!panel) return;
  tickCount++;
  panel.tick?.();
  if (panel.every && tickCount % panel.every === 0) renderCurrent();
}, 1000);
