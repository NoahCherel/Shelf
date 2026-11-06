import type { Shown } from "../preview/PreviewWindow";
import { fakeApps, fakeAudio, fakeNotifications, fakeSearchFiles, fakeWifi } from "./fixtures";

export interface Scene {
  id: string;
  size: [number, number];
  wallpaper: "glow" | "ribbons" | "pale";
  theme: "dark" | "light";
  dock?: string[]; // widget ids, drawn in a real bar with the real shader
  previews?: Shown; // the strip above the bar, with empty frames: Windows draws the pictures
  card?: string; // card id, drawn above the bar
  anchor?: string; // selector the card centres on, when it isn't a tile's id
  view?: "picker" | "settings"; // a whole window instead of a dock
  settings?: Record<string, unknown>;
  backend?: Record<string, (args: any) => unknown>;
  /** type: text into what has focus. */
  steps?: { hover?: string; click?: string; type?: string }[]; // selectors, run through the debug port
  measure?: { name: string; expect: string }[]; // JavaScript run in the page; each must be true
  scale?: number; // display scale, default 1.25 as on the owner's PC
}

const DOCK = ["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather"];
const WIDE: [number, number] = [1536, 200];
const TALL: [number, number] = [1536, 640];

const T = `parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--T"))`;
const appLefts = `[...document.querySelectorAll(".app")].map((a) => a.getBoundingClientRect().left)`;

export const scenes: Scene[] = [
  {
    id: "dock-default",
    size: WIDE,
    wallpaper: "glow",
    theme: "dark",
    dock: DOCK,
    measure: [{ name: "the bar is centred", expect: `Math.abs(document.querySelector(".dock").getBoundingClientRect().left + document.querySelector(".dock").getBoundingClientRect().width / 2 - innerWidth / 2) < 2` }],
  },
  { id: "dock-ribbons", size: WIDE, wallpaper: "ribbons", theme: "dark", dock: DOCK },
  {
    id: "dock-top",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    settings: { edge: "top" },
    card: "__panel:sound",
    anchor: '[data-widget-id="system-status"]',
    measure: [{ name: "the bar is at the top", expect: `document.querySelector(".dock").getBoundingClientRect().top < 10` }],
  },
  {
    id: "dock-full",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    settings: { dockWidth: "full" },
    measure: [
      { name: "the bar spans the screen", expect: `Math.round(document.querySelector(".dock").getBoundingClientRect().width) === innerWidth` },
      { name: "the bar sits on the edge", expect: `Math.round(document.querySelector(".dock").getBoundingClientRect().bottom) === innerHeight` },
      {
        name: "the widgets are together in the middle",
        expect: `(() => { const s = [...document.querySelectorAll(".slot")].map((e) => e.getBoundingClientRect()); return Math.abs(s[0].left - (innerWidth - s[s.length - 1].right)) < 3; })()`,
      },
    ],
  },
  {
    id: "dock-full-spaces",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: ["apps", "space:1", "claude-plan-usage", "github-activity", "space:2", "system-status", "clock-and-weather"],
    settings: { dockWidth: "full" },
    measure: [
      { name: "the apps start at the left end", expect: `document.querySelector('[data-widget-id="apps"]').getBoundingClientRect().left < 10` },
      { name: "the clock ends at the right end", expect: `innerWidth - document.querySelector('[data-widget-id="clock-and-weather"]').getBoundingClientRect().right < 10` },
      {
        name: "the two spaces share the room evenly",
        expect: `(() => { const [a, b] = [...document.querySelectorAll(".slot--space")].map((e) => e.getBoundingClientRect().width); return a > 100 && Math.abs(a - b) < 2; })()`,
      },
    ],
  },
  {
    id: "dock-narrow",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    settings: { narrowWidth: 560 },
    measure: [{ name: "the bar is as narrow as asked", expect: `Math.round(document.querySelector(".dock").getBoundingClientRect().width) === 560` }],
  },
  ...(["ios", "midnight", "white", "clear"] as const).flatMap((style) => [
    // Clear's frosting only shows over something bright behind it.
    { id: `dock-${style}`, size: WIDE, wallpaper: style === "clear" ? ("glow" as const) : ("ribbons" as const), theme: "dark" as const, dock: DOCK, settings: { style } },
    { id: `dock-${style}-light`, size: WIDE, wallpaper: "pale" as const, theme: "light" as const, dock: DOCK, settings: { style } },
  ]),
  { id: "dock-clear-black", size: WIDE, wallpaper: "glow", theme: "dark", dock: DOCK, settings: { style: "clear", clearMaterial: "black" } },
  { id: "dock-clear-white", size: WIDE, wallpaper: "glow", theme: "dark", dock: DOCK, settings: { style: "clear", clearMaterial: "white" } },
  {
    id: "dock-pill-with-spaces",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: ["claude-usage", "github-activity", "space:1", "apps", "space:2", "system-status", "space:3", "clock", "battery"],
    settings: { style: "ios", edge: "top", spacing: 24, edgeGap: 0 },
    measure: [
      { name: "the pill is narrower than the screen", expect: `document.querySelector(".dock").getBoundingClientRect().width < innerWidth - 100` },
      { name: "the bar shows", expect: `document.querySelectorAll(".slot:not(.slot--space)").length === 6 && document.querySelector(".dock").getBoundingClientRect().height > 40` },
    ],
  },
  { id: "dock-full-black", size: WIDE, wallpaper: "pale", theme: "light", dock: DOCK, settings: { dockWidth: "full", style: "black" } },
  { id: "dock-spaced", size: WIDE, wallpaper: "glow", theme: "dark", dock: DOCK, settings: { spacing: 24 } },
  { id: "dock-light", size: WIDE, wallpaper: "pale", theme: "light", dock: DOCK },
  {
    id: "dock-focus",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: ["apps"],
    measure: [
      { name: "apps are at least 0.9T apart", expect: `(${appLefts})[1] - (${appLefts})[0] >= ${T} * 0.9` },
      { name: "one app is marked", expect: `document.querySelectorAll(".app--active").length === 1` },
      {
        name: "the focus plate is wider than the icon",
        expect: `(() => { const a = document.querySelector(".app--active"); const inset = parseFloat(getComputedStyle(a, "::before").left); return a.getBoundingClientRect().width - inset * 2 > a.querySelector(".app__icon").getBoundingClientRect().width; })()`,
      },
    ],
  },
  {
    id: "dock-apps-many",
    size: [1200, 200],
    wallpaper: "glow",
    theme: "dark",
    dock: DOCK,
    backend: { apps_list: () => fakeApps(40, 3) },
    measure: [{ name: "the bar stays on the screen", expect: `document.querySelector(".dock").getBoundingClientRect().width <= innerWidth` }],
  },
  { id: "card-claude", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "claude-plan-usage" },
  { id: "card-date", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "clock-and-weather" },
  { id: "menu", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__menu:github-activity" },
  { id: "card-sound", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:sound", anchor: '[aria-label="Sound"]' },
  {
    id: "card-sound-muted",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:sound",
    anchor: '[aria-label="Sound"]',
    backend: { audio_state: () => ({ ...fakeAudio(1), muted: true }) },
  },
  {
    id: "card-sound-no-device",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:sound",
    anchor: '[aria-label="Sound"]',
    backend: { audio_state: () => ({ ...fakeAudio(0), device: null, devices: [] }) },
  },
  {
    id: "card-sound-many-apps",
    size: [1536, 800],
    wallpaper: "glow",
    theme: "dark",
    dock: DOCK,
    card: "__panel:sound",
    anchor: '[aria-label="Sound"]',
    backend: { audio_state: () => fakeAudio(12) },
    measure: [
      { name: "the card stays under 640 px", expect: `document.querySelector(".bench__card .card").getBoundingClientRect().height <= 640` },
      { name: "the card's foot stays in the card", expect: `document.querySelector(".bench__card .card__foot").getBoundingClientRect().bottom <= document.querySelector(".bench__card .card").getBoundingClientRect().bottom` },
      { name: "the long list scrolls inside the card", expect: `(() => { const b = document.querySelector(".bench__card .card__body"); return b.scrollHeight > b.clientHeight; })()` },
    ],
  },
  { id: "card-sound-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__panel:sound", anchor: '[aria-label="Sound"]' },
  { id: "card-wifi", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:wifi", anchor: '[aria-label="Network"]' },
  {
    id: "card-wifi-password",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:wifi",
    anchor: '[aria-label="Network"]',
    steps: [{ click: '.wifi__main[aria-label="Freebox-77AA10"]' }],
  },
  {
    id: "card-wifi-wrong-password",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:wifi",
    anchor: '[aria-label="Network"]',
    backend: { wifi_networks: () => fakeWifi({ attempt: { id: "C3", state: "failed", error: "Wrong password." } }) },
  },
  {
    id: "card-wifi-no-adapter",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:wifi",
    anchor: '[aria-label="Network"]',
    backend: { wifi_networks: () => fakeWifi({ adapter: false, on: false, networks: [] }) },
  },
  {
    id: "card-wifi-off",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:wifi",
    anchor: '[aria-label="Network"]',
    backend: { wifi_networks: () => fakeWifi({ on: false, networks: [] }) },
  },
  { id: "card-wifi-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__panel:wifi", anchor: '[aria-label="Network"]' },
  { id: "card-quick", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:quick", anchor: '[aria-label="Battery"]' },
  {
    id: "card-quick-desktop",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:quick",
    anchor: '[aria-label="Quick settings"]',
    backend: {
      brightness_get: () => null,
      toggles_state: () => ({ airplane: false, dnd: true, night_light: false, energy_saver: null }),
      system_status: () => ({ wifi: null, online: true, volume: { percent: 60, muted: false }, battery: null }),
    },
  },
  {
    id: "card-quick-radio-error",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:quick",
    anchor: '[aria-label="Battery"]',
    backend: {
      radio_set: () => {
        throw "Windows didn't allow Shelf to change this radio.";
      },
    },
    steps: [{ click: '[role="switch"][aria-label="Bluetooth"]' }],
  },
  { id: "card-quick-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__panel:quick", anchor: '[aria-label="Battery"]' },
  {
    id: "card-black-light",
    size: TALL,
    wallpaper: "pale",
    theme: "light",
    settings: { style: "black" },
    dock: DOCK,
    card: "__panel:quick",
    anchor: '[aria-label="Battery"]',
    measure: [
      { name: "the card's text is dark on its white", expect: `getComputedStyle(document.querySelector(".bench__card .card__title")).color === "rgb(28, 28, 30)"` },
      { name: "the bar's text stays light on its black", expect: `getComputedStyle(document.querySelector(".dock")).color === "rgb(245, 245, 247)"` },
    ],
  },
  { id: "card-quick-links", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__panel:quick", anchor: '[aria-label="Battery"]', backend: { toggles_state: () => ({ airplane: null, dnd: null, night_light: false, energy_saver: false }) } },
  { id: "card-bluetooth", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:bluetooth", anchor: '[aria-label="Battery"]', backend: { radios_state: () => [{ kind: "wifi", on: true }, { kind: "bluetooth", on: true }] } },
  { id: "card-bluetooth-off", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__panel:bluetooth", anchor: '[aria-label="Battery"]' },
  {
    id: "dock-battery-widget",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: [...DOCK, "battery"],
    measure: [
      { name: "the status tile gives way to the battery widget", expect: `!document.querySelector('[aria-label="Battery"]') && !!document.querySelector('[aria-label="Quick settings"]')` },
    ],
  },
  { id: "card-search-empty", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:search", anchor: '[aria-label="Search"]' },
  {
    id: "card-search-recent",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:search",
    anchor: '[aria-label="Search"]',
    backend: {
      store_load: ({ name }: { name: string }) => (name === "search-history" ? { Firefox: 5, Discord: 2 } : name === "search-recent" ? ["facture", "météo nice"] : null),
      search_recent_files: () => fakeSearchFiles().map(({ id, name, kind }) => ({ id, name, kind })),
    },
  },
  { id: "card-search-results", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:search", anchor: '[aria-label="Search"]', steps: [{ type: "pa" }] },
  { id: "card-search-no-results", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__panel:search", anchor: '[aria-label="Search"]', backend: { search_files: () => [] }, steps: [{ type: "zzzz" }] },
  {
    id: "card-search-long-names",
    size: TALL,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    card: "__panel:search",
    anchor: '[aria-label="Search"]',
    backend: {
      search_files: () => [
        { id: "file:1", name: "pa un document au nom vraiment très très long qui ne tient absolument pas sur une seule ligne de la carte.pdf", kind: "file", detail: "Un dossier au nom également beaucoup trop long pour tenir" },
      ],
    },
    steps: [{ type: "pa" }],
    measure: [{ name: "a long name stays inside its row", expect: `[...document.querySelectorAll(".search__row")].every((r) => r.scrollWidth <= r.clientWidth)` }],
  },
  { id: "card-search-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__panel:search", anchor: '[aria-label="Search"]', steps: [{ type: "pa" }] },
  {
    id: "dock-many-windows",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    backend: {
      apps_list: () => {
        const apps = fakeApps(5, 2);
        apps[0].windows = [
          { hwnd: 1, title: "One" },
          { hwnd: 2, title: "Two" },
        ];
        apps[2].windows = [
          { hwnd: 3, title: "Three" },
          { hwnd: 4, title: "Four" },
        ];
        return apps;
      },
    },
  },
  {
    id: "previews",
    size: TALL,
    wallpaper: "glow",
    theme: "dark",
    dock: DOCK,
    previews: {
      key: "app-0",
      name: "App 0",
      slotWidth: 220,
      windows: [
        { hwnd: 1, title: "A window with a title far too long to fit in its row", minimized: false },
        { hwnd: 2, title: "A second window", minimized: false },
        { hwnd: 3, title: "A minimized window", minimized: true },
      ],
    },
  },
  { id: "card-notifications", size: TALL, wallpaper: "glow", theme: "dark", dock: DOCK, card: "__panel:notifications", anchor: '[aria-label="Notifications"]', backend: { notifications_list: () => fakeNotifications() } },
  { id: "card-notifications-empty", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__panel:notifications", anchor: '[aria-label="Notifications"]' },
  { id: "card-notifications-refused", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__panel:notifications", anchor: '[aria-label="Notifications"]', backend: { notifications_list: () => ({ access: false, items: [] }) } },
  { id: "card-notifications-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__panel:notifications", anchor: '[aria-label="Notifications"]', backend: { notifications_list: () => fakeNotifications() } },
  {
    id: "dock-notification-count",
    size: WIDE,
    wallpaper: "ribbons",
    theme: "dark",
    dock: DOCK,
    backend: { system_status: () => ({ wifi: { ssid: "Home", signal: 90 }, online: true, volume: { percent: 60, muted: false }, battery: { percent: 64, charging: false }, notifications: 3 }) },
  },
  { id: "card-app-menu", size: TALL, wallpaper: "ribbons", theme: "dark", dock: DOCK, card: "__appmenu:app-0", anchor: '[aria-label="App 0"]' },
  { id: "card-app-menu-light", size: TALL, wallpaper: "pale", theme: "light", dock: DOCK, card: "__appmenu:app-0", anchor: '[aria-label="App 0"]' },
  {
    id: "card-app-menu-pinned-many",
    size: TALL,
    wallpaper: "glow",
    theme: "dark",
    dock: DOCK,
    card: "__appmenu:app-0",
    anchor: '[aria-label="App 0"]',
    backend: {
      apps_menu: () => ({
        items: [
          { id: "open", label: "Explorateur de fichiers" },
          { id: "unpin", label: "Détacher de la barre des tâches" },
          { id: "close-all", label: "Fermer toutes les fenêtres" },
        ],
      }),
    },
  },
  { id: "picker", size: [1225, 825], wallpaper: "ribbons", theme: "dark", view: "picker", scale: 1 },
  { id: "settings-dock", size: [950, 700], wallpaper: "ribbons", theme: "dark", view: "settings", scale: 1, steps: [{ click: ".side__row:nth-of-type(2)" }] },
];

/** Our own test scenes: bright curves on dark, so bending shows up at the bar's edges. */
export function paintWallpaper(g: CanvasRenderingContext2D, w: number, h: number, kind: Scene["wallpaper"]): void {
  if (kind === "pale") {
    const pale = g.createLinearGradient(0, 0, w, h);
    pale.addColorStop(0, "#eef3fb");
    pale.addColorStop(1, "#d9e4f5");
    g.fillStyle = pale;
    g.fillRect(0, 0, w, h);
    return;
  }
  g.fillStyle = "#07060c";
  g.fillRect(0, 0, w, h);
  if (kind === "glow") {
    const glow = g.createRadialGradient(w / 2, -h * 0.6, h * 0.5, w / 2, -h * 0.6, h * 1.75);
    glow.addColorStop(0, "#7a0a64");
    glow.addColorStop(0.62, "#c81e6e");
    glow.addColorStop(0.8, "#f4b2ff");
    glow.addColorStop(0.86, "#ffd65a");
    glow.addColorStop(0.93, "#d97a12");
    glow.addColorStop(1, "#1a0806");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    return;
  }
  // Hard-edged ribbons, the hardest thing to bend convincingly.
  ["#ff2d6f", "#ffb000", "#7a5cff", "#21d4fd"].forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = (26 - i * 4) * (h / 300);
    g.beginPath();
    g.moveTo(-20, h * (0.2 + i * 0.2));
    g.bezierCurveTo(w * 0.3, h * (1.1 - i * 0.25), w * 0.6, h * (0.1 + i * 0.2), w + 20, h * (0.85 - i * 0.15));
    g.stroke();
  });
}
