import { beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { AppsTile, stableOrder, type AppEntry } from "./Tile";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}) }));

const mockInvoke = vi.mocked(invoke);

const app = (key: string, open = false, active = false): AppEntry => ({
  key,
  name: key,
  pinned: !open,
  active,
  windows: open ? [{ hwnd: 1, title: `${key} window` }] : [],
});

beforeEach(() => {
  mockInvoke.mockClear();
});

it("keeps a stable order when focus changes", () => {
  const before = [app("a"), app("b"), app("c")];
  const after = [app("c"), app("a"), app("b")];
  expect(stableOrder(before, after).map((e) => e.key)).toEqual(["a", "b", "c"]);
});

it("adds new apps last and drops closed ones", () => {
  const before = [app("a"), app("b")];
  const after = [app("c"), app("b")];
  expect(stableOrder(before, after).map((e) => e.key)).toEqual(["b", "c"]);
});

it("shows a dot only for open apps", () => {
  const { container } = render(<AppsTile data={[app("shut"), app("open", true)]} status="ready" />);
  const dots = container.querySelectorAll(".app__dot");
  expect(dots.length).toBe(1);
  expect(dots[0].closest("button")?.getAttribute("aria-label")).toBe("open");
});

it("activates on click", () => {
  render(<AppsTile data={[app("code", true)]} status="ready" />);
  fireEvent.click(screen.getByRole("button", { name: "code" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "code" });
});

it("opens Start from the first tile", () => {
  render(<AppsTile data={[]} status="ready" />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(mockInvoke).toHaveBeenCalledWith("start_menu");
});

it("asks for each icon once, however often it redraws", () => {
  const data = [app("code", true)];
  const { rerender } = render(<AppsTile data={data} status="ready" />);
  rerender(<AppsTile data={[...data]} status="ready" />);
  expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_icon").length).toBeLessThanOrEqual(1);
});

it("asks again when an icon isn't ready yet", async () => {
  vi.useFakeTimers();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_icon" ? null : null));
  const { container } = render(<AppsTile data={[app("late", true)]} status="ready" />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(container.querySelector("img")).toBeNull();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_icon" ? "data:image/png;base64,AA" : null));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(container.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  vi.useRealTimers();
});

it("does nothing when clicked in the picker", () => {
  render(<AppsTile data={[app("code", true)]} status="sample" preview />);
  fireEvent.click(screen.getByRole("button", { name: "code" }));
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(mockInvoke.mock.calls.filter((c) => c[0] !== "apps_icon")).toEqual([]);
});

it("shows the window title on hover", () => {
  render(<AppsTile data={[app("code", true)]} status="ready" />);
  expect(screen.getByRole("button", { name: "code" }).getAttribute("title")).toBe("code window");
});
