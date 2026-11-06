import { beforeEach, vi } from "vitest";
import { invoke } from "./tauri";
import { defaults, sanitize, useSettings } from "./settings";

vi.mock("./tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  useSettings.setState({ ...defaults() });
});

it("defaults are M size, taskbar Hidden, theme follows Windows, style Liquid Glass", () => {
  const d = defaults();
  expect(d.size).toBe(50);
  expect(d.taskbarMode).toBe("hidden");
  expect(d.theme).toBe("auto");
  expect(d.style).toBe("liquid");
  expect(d.lockDock).toBe(false);
});

it("floats over windows by default, with a small gap", () => {
  expect(defaults().floatOverWindows).toBe(true);
  expect(defaults().edgeGap).toBe(6);
});

it("the gap stays within its slider", () => {
  expect(sanitize({ edgeGap: 99 }).edgeGap).toBe(24);
  expect(sanitize({ edgeGap: -3 }).edgeGap).toBe(0);
  expect(sanitize({ edgeGap: "x" }).edgeGap).toBe(6);
  expect(sanitize({ floatOverWindows: false }).floatOverWindows).toBe(false);
});

it("24-hour comes from the locale", () => {
  const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
  spy.mockReturnValue({ hour12: true } as Intl.ResolvedDateTimeFormatOptions);
  expect(defaults().hour24).toBe(false);
  spy.mockReturnValue({ hour12: false } as Intl.ResolvedDateTimeFormatOptions);
  expect(defaults().hour24).toBe(true);
  spy.mockRestore();
});

it("invalid saved values fall back per key without losing the others", () => {
  const s = sanitize({ size: "huge", style: "chrome", accent: "#ff0000", seconds: 3, lockDock: true, weather: { city: "Paris" }, github: 7 });
  expect(s.size).toBe(defaults().size);
  expect(s.style).toBe("liquid");
  expect(s.seconds).toBe(defaults().seconds);
  expect(s.accent).toBe("#ff0000");
  expect(s.lockDock).toBe(true);
  expect(s.weather.city).toBe("Paris");
  expect(s.github.user).toBe("");
});

it("a size outside the slider is clamped", () => {
  expect(sanitize({ size: 500 }).size).toBe(62);
  expect(sanitize({ size: 2 }).size).toBe(40);
});

it("a corrupt file gives the defaults", () => {
  for (const bad of [null, 7, "x", []]) expect(sanitize(bad)).toEqual(defaults());
});

it("update saves through the store", () => {
  useSettings.getState().update({ seconds: false });
  expect(useSettings.getState().seconds).toBe(false);
  const [cmd, args] = mockInvoke.mock.calls[0];
  expect(cmd).toBe("store_save");
  expect(args).toMatchObject({ name: "settings", value: { seconds: false, version: 1 } });
});

it("load applies what's saved", async () => {
  mockInvoke.mockResolvedValue({ size: 44, github: { user: "octocat" } });
  await useSettings.getState().load();
  expect(useSettings.getState().size).toBe(44);
  expect(useSettings.getState().github.user).toBe("octocat");
});

it("the dock starts as it always has: a pill at the bottom, spaced as before", () => {
  const d = defaults();
  expect([d.edge, d.dockWidth, d.spacing]).toEqual(["bottom", "pill", 4]);
});

it("position settings fall back on their own, and spacing stays within its slider", () => {
  const s = sanitize({ edge: "left", dockWidth: "huge", spacing: 99 });
  expect([s.edge, s.dockWidth, s.spacing]).toEqual(["bottom", "pill", 24]);
  const t = sanitize({ edge: "top", dockWidth: "full", spacing: -1 });
  expect([t.edge, t.dockWidth, t.spacing]).toEqual(["top", "full", 0]);
});

it("auto-hide and its desktop option start off, and only take true or false", () => {
  expect([defaults().autoHide, defaults().showOnDesktop]).toEqual([false, false]);
  const s = sanitize({ autoHide: "yes", showOnDesktop: true });
  expect([s.autoHide, s.showOnDesktop]).toEqual([false, true]);
});

it("a narrowed dock keeps a sensible width, or none", () => {
  expect(defaults().narrowWidth).toBeNull();
  expect(sanitize({ narrowWidth: 300 }).narrowWidth).toBe(300);
  expect(sanitize({ narrowWidth: 10 }).narrowWidth).toBe(40);
  expect(sanitize({ narrowWidth: "wide" }).narrowWidth).toBeNull();
});

it("all six styles are kept, and Clear's material falls back on its own", () => {
  for (const style of ["liquid", "ios", "midnight", "black", "white", "clear"]) expect(sanitize({ style }).style).toBe(style);
  expect(defaults().clearMaterial).toBe("frosted");
  expect(sanitize({ clearMaterial: "white" }).clearMaterial).toBe("white");
  expect(sanitize({ clearMaterial: "gold" }).clearMaterial).toBe("frosted");
});
