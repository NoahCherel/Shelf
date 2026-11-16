import { IDLE, navigate, type NavState } from "./keyNav";
import type { AppEntry } from "./entry";

const app = (key: string, windows = 1, active = false, kind?: AppEntry["kind"]): AppEntry => ({
  key,
  name: key,
  pinned: windows === 0,
  active,
  kind,
  windows: Array.from({ length: windows }, (_, i) => ({ hwnd: key.charCodeAt(0) * 10 + i, title: `${key} ${i}` })),
});

const at = (key: string, window: number | null = null): NavState => ({ key, window });

it("starts on the app in front, or the first open one", () => {
  expect(navigate(IDLE, { kind: "start" }, [app("pinned", 0), app("a"), app("b", 1, true)]).state).toEqual(at("b"));
  expect(navigate(IDLE, { kind: "start" }, [app("pinned", 0), app("a"), app("b")]).state).toEqual(at("a"));
});

it("moves along open apps and wraps both ways", () => {
  const apps = [app("a"), app("shut", 0), app("b"), app("c")];
  expect(navigate(at("a"), { kind: "move", step: 1 }, apps)).toEqual({ state: at("b"), effect: { kind: "none" } });
  expect(navigate(at("c"), { kind: "move", step: 1 }, apps).state).toEqual(at("a"));
  expect(navigate(at("a"), { kind: "move", step: -1 }, apps).state).toEqual(at("c"));
  expect(navigate(at("a", 1), { kind: "move", step: 1 }, apps).effect).toEqual({ kind: "hide" });
});

it("tab walks the focused app's windows and shows them", () => {
  const apps = [app("a", 3)];
  const first = navigate(at("a"), { kind: "window", step: 1 }, apps);
  expect(first).toEqual({ state: at("a", 1), effect: { kind: "show", key: "a", hwnd: apps[0].windows[1].hwnd } });
  expect(navigate(at("a", 2), { kind: "window", step: 1 }, apps).state).toEqual(at("a", 0));
  expect(navigate(at("a", 0), { kind: "window", step: -1 }, apps).state).toEqual(at("a", 2));
});

it("enter brings the chosen window forward", () => {
  const apps = [app("a", 2)];
  expect(navigate(at("a"), { kind: "activate" }, apps)).toEqual({ state: IDLE, effect: { kind: "activate", hwnd: apps[0].windows[0].hwnd } });
  expect(navigate(at("a", 1), { kind: "activate" }, apps).effect).toEqual({ kind: "activate", hwnd: apps[0].windows[1].hwnd });
});

it("with nothing open, navigation ends at once", () => {
  expect(navigate(IDLE, { kind: "start" }, [app("pinned", 0)])).toEqual({ state: IDLE, effect: { kind: "end" } });
});

it("a focused app that closed moves on to the next", () => {
  expect(navigate(at("gone"), { kind: "move", step: 1 }, [app("a"), app("b")]).state).toEqual(at("a"));
});

it("escape hides the previews", () => {
  expect(navigate(at("a", 1), { kind: "cancel" }, [app("a", 2)])).toEqual({ state: IDLE, effect: { kind: "hide" } });
});

it("groups are skipped", () => {
  const apps = [app("a"), app("g", 2, false, "group"), app("b")];
  expect(navigate(at("a"), { kind: "move", step: 1 }, apps).state).toEqual(at("b"));
});
