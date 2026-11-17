import { beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { emit, invoke } from "../../core/tauri";
import { ToastWindow } from "./ToastWindow";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const TOAST = {
  id: "ai-limit-session",
  title: "Claude session at 80%",
  body: "Resets in 1h 25m.",
  action: { label: "Details", target: "widget:claude-usage" },
  sound: true,
};

const done = () => vi.mocked(invoke).mock.calls.filter(([c]) => c === "toast_done").length;

async function shown() {
  render(<ToastWindow />);
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockReset();
  vi.mocked(emit).mockReset();
  vi.mocked(invoke).mockImplementation(async (command: string) => (command === "toast_current" ? TOAST : null) as never);
});

it("shows the toast that was waiting when the window opened", async () => {
  await shown();
  expect(screen.getByText("Claude session at 80%")).toBeTruthy();
  expect(screen.getByText("Resets in 1h 25m.")).toBeTruthy();
});

it("closes by itself after 8 seconds", async () => {
  await shown();
  act(() => vi.advanceTimersByTime(7999));
  expect(done()).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(done()).toBe(1);
});

it("waits while the pointer is on it", async () => {
  await shown();
  act(() => vi.advanceTimersByTime(5000));
  fireEvent.pointerEnter(screen.getByRole("status"));
  act(() => vi.advanceTimersByTime(20000));
  expect(done()).toBe(0);
  fireEvent.pointerLeave(screen.getByRole("status"));
  act(() => vi.advanceTimersByTime(2999));
  expect(done()).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(done()).toBe(1);
});

it("the action asks the dock to open the card", async () => {
  await shown();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(emit).toHaveBeenCalledWith("open-request", { target: "widget:claude-usage" });
  expect(done()).toBe(1);
});

it("dismiss closes it", async () => {
  await shown();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(done()).toBe(1);
  act(() => vi.advanceTimersByTime(10000));
  expect(done()).toBe(1);
});

it("no action, no button", async () => {
  vi.mocked(invoke).mockImplementation(async (command: string) => (command === "toast_current" ? { ...TOAST, action: null } : null) as never);
  await shown();
  expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
});
