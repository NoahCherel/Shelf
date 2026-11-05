import type { Shown } from "../preview/PreviewWindow";
import { fakeApps, fakeAudio, fakeWifi } from "./fixtures";

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
    backend: { store_load: ({ name }: { name: string }) => (name === "search-history" ? { Firefox: 5, Discord: 2, Paint: 1 } : null) },
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
