import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { NotificationsCard } from "./NotificationsCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);
const NOW = new Date(2026, 10, 5, 15, 0, 0).getTime();

const LIST = {
  access: true,
  items: [
    { id: 1, app: "Discord", title: "Alex", body: "See you tonight", at: NOW - 5 * 60_000 },
    { id: 2, app: "Outlook", title: "Invoice", body: "", at: NOW - 3 * 3_600_000 },
  ],
};

let list = LIST;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  list = LIST;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "notifications_list" ? list : null));
});

afterEach(() => {
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<NotificationsCard />);
  await flush();
  return view;
}

it("shows each notification with its app, text and age", async () => {
  await openCard();
  expect(screen.getByText("Discord")).toBeTruthy();
  expect(screen.getByText("Alex")).toBeTruthy();
  expect(screen.getByText("See you tonight")).toBeTruthy();
  expect(screen.getByText("5 min")).toBeTruthy();
  expect(screen.getByText("3 h")).toBeTruthy();
});

it("the cross dismisses that one, at once, and doesn't open it", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Alex" }));
  expect(mockInvoke).toHaveBeenCalledWith("notification_dismiss", { id: 1 });
  expect(mockInvoke).not.toHaveBeenCalledWith("notification_open", expect.anything());
  expect(screen.queryByText("Alex")).toBeNull();
});

it("a dismissal that fails brings it back", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "notification_dismiss") throw "no";
    return cmd === "notifications_list" ? list : null;
  });
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Alex" }));
  await flush();
  expect(screen.getByText("Alex")).toBeTruthy();
});

it("clicking one opens its app and closes the card", async () => {
  await openCard();
  fireEvent.click(screen.getByText("Alex"));
  await flush();
  expect(mockInvoke).toHaveBeenCalledWith("notification_open", { id: 1 });
  expect(mockInvoke).toHaveBeenCalledWith("close_card");
});

it("one that can't be opened stays, and says so", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "notification_open") throw "Windows has no way to open this one.";
    return cmd === "notifications_list" ? list : null;
  });
  await openCard();
  fireEvent.click(screen.getByText("Alex"));
  await flush();
  expect(mockInvoke).not.toHaveBeenCalledWith("close_card");
  expect(screen.getByText("Alex")).toBeTruthy();
  expect(screen.getByText(/no way to open this one/)).toBeTruthy();
});

it("clear all empties the list", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(mockInvoke).toHaveBeenCalledWith("notifications_clear");
  expect(screen.getByText(/No new notifications/)).toBeTruthy();
});

it("nothing to show says so, with nothing to clear", async () => {
  list = { access: true, items: [] };
  await openCard();
  expect(screen.getByText(/No new notifications/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
});

it("refused access explains it and links to that setting", async () => {
  list = { access: false, items: [] };
  await openCard();
  expect(screen.getByText(/allowed to read/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Notification access/ }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "privacy-notifications" });
});

it("what a notification says is text, never HTML", async () => {
  list = { access: true, items: [{ id: 3, app: "App", title: "<img src=x onerror=alert(1)>", body: "<b>hi</b>", at: NOW }] };
  await openCard();
  expect(document.querySelector("img[src='x']")).toBeNull();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
});

it("a new one arriving shows without reopening", async () => {
  await openCard();
  list = { access: true, items: [{ id: 9, app: "Teams", title: "New", body: "", at: NOW }, ...LIST.items] };
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(screen.getByText("New")).toBeTruthy();
});
