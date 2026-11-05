import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { emit, invoke } from "../../core/tauri";
import { WifiCard } from "./WifiCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const net = (id: string, name: string, more: object = {}) => ({ id, name, signal: 70, auth: "wpa2", saved: false, connected: false, ...more });

const LIST = {
  adapter: true,
  on: true,
  permission: true,
  attempt: null as null | { id: string; state: string; error: string | null },
  networks: [
    net("AA", "Livebox", { connected: true, saved: true, signal: 90 }),
    net("BB", "Saved place", { saved: true, signal: 60 }),
    net("CC", "Neighbour", { signal: 40 }),
    net("DD", "Free cafe", { auth: "open", signal: 30 }),
    net("EE", "Office", { auth: "enterprise", signal: 20 }),
  ],
};

let list = LIST;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  list = LIST;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "wifi_networks" ? list : null));
});

afterEach(() => {
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<WifiCard />);
  await flush();
  return view;
}

const row = (name: string) => screen.getByText(name).closest(".wifi__row") as HTMLElement;
const connects = () => mockInvoke.mock.calls.filter((c) => c[0] === "wifi_connect");
const names = () => [...document.querySelectorAll(".wifi__name")].map((e) => e.textContent);

async function typePassword(name: string, value: string) {
  fireEvent.click(within(row(name)).getByRole("button", { name }));
  fireEvent.change(screen.getByLabelText(`Password for ${name}`), { target: { value } });
}

it("lists networks with signal, lock and connected state", async () => {
  await openCard();
  expect(names()).toEqual(["Livebox", "Saved place", "Neighbour", "Free cafe", "Office"]);
  expect(within(row("Livebox")).getByText("Connected")).toBeTruthy();
  expect(within(row("Saved place")).getByText("Saved")).toBeTruthy();
  expect(row("Livebox").querySelector("[data-bars='4']")).toBeTruthy();
  expect(row("Neighbour").querySelector("[data-locked]")).toBeTruthy();
  expect(row("Free cafe").querySelector("[data-locked]")).toBeNull();
});

it("scans on opening and every 10 seconds while open, and stops when closed", async () => {
  const { unmount } = await openCard();
  const scans = () => mockInvoke.mock.calls.filter((c) => c[0] === "wifi_scan").length;
  expect(scans()).toBe(1);
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(scans()).toBe(2);
  unmount();
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(scans()).toBe(2);
});

it("a saved network connects on click", async () => {
  await openCard();
  fireEvent.click(within(row("Saved place")).getByRole("button", { name: "Saved place" }));
  expect(connects()).toEqual([["wifi_connect", { id: "BB", password: null }]]);
  expect(screen.queryByLabelText(/Password/)).toBeNull();
});

it("an open network connects on click", async () => {
  await openCard();
  fireEvent.click(within(row("Free cafe")).getByRole("button", { name: "Free cafe" }));
  expect(connects()).toEqual([["wifi_connect", { id: "DD", password: null }]]);
});

it("a new secured one asks for its password in the row", async () => {
  await openCard();
  fireEvent.click(within(row("Neighbour")).getByRole("button", { name: "Neighbour" }));
  expect(connects()).toEqual([]);
  expect(within(row("Neighbour")).getByLabelText("Password for Neighbour")).toBeTruthy();
});

it("an enterprise network goes to Settings", async () => {
  await openCard();
  fireEvent.click(within(row("Office")).getByRole("button", { name: "Office" }));
  expect(connects()).toEqual([]);
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "network-wifi" });
});

it("the password never appears once submitted", async () => {
  await openCard();
  await typePassword("Neighbour", "hunter2hunter2");
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await flush();
  expect(screen.queryByLabelText(/Password/)).toBeNull();
  expect(document.body.innerHTML).not.toContain("hunter2");
});

it("the password is sent only to wifi_connect", async () => {
  await openCard();
  await typePassword("Neighbour", "hunter2hunter2");
  fireEvent.keyDown(screen.getByLabelText("Password for Neighbour"), { key: "Enter" });
  await act(() => vi.advanceTimersByTimeAsync(11000));
  expect(connects()).toEqual([["wifi_connect", { id: "CC", password: "hunter2hunter2" }]]);
  const others = mockInvoke.mock.calls.filter((c) => c[0] !== "wifi_connect");
  expect(JSON.stringify(others)).not.toContain("hunter2");
  expect(JSON.stringify(vi.mocked(emit).mock.calls)).not.toContain("hunter2");
});

it("a password Windows would refuse stays in the box with the reason", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "wifi_connect") throw "Wi-Fi passwords are 8 to 63 characters.";
    return cmd === "wifi_networks" ? list : null;
  });
  await openCard();
  await typePassword("Neighbour", "short");
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await flush();
  expect(within(row("Neighbour")).getByText(/8 to 63/)).toBeTruthy();
  expect((screen.getByLabelText("Password for Neighbour") as HTMLInputElement).value).toBe("short");
});

it("a wrong password shows a plain error on that row", async () => {
  list = { ...LIST, attempt: { id: "CC", state: "failed", error: "Wrong password." } };
  await openCard();
  expect(within(row("Neighbour")).getByText("Wrong password.")).toBeTruthy();
  expect(within(row("Neighbour")).getByLabelText("Password for Neighbour")).toBeTruthy();
  expect(within(row("Free cafe")).queryByText("Wrong password.")).toBeNull();
});

it("disconnecting needs a second click", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  expect(mockInvoke).not.toHaveBeenCalledWith("wifi_disconnect");
  fireEvent.click(screen.getByRole("button", { name: "Really disconnect?" }));
  expect(mockInvoke).toHaveBeenCalledWith("wifi_disconnect");
});

it("moving away cancels a half-made disconnect", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  fireEvent.mouseLeave(screen.getByRole("button", { name: "Really disconnect?" }));
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
});

it("no adapter shows a plain message", async () => {
  list = { ...LIST, adapter: false, networks: [] };
  await openCard();
  expect(screen.getByText(/no Wi-Fi adapter/)).toBeTruthy();
});

it("Wi-Fi off shows how to turn it on", async () => {
  list = { ...LIST, on: false, networks: [] };
  await openCard();
  expect(screen.getByText(/Wi-Fi is off/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Wi-Fi settings/ }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "network-wifi" });
});

it("refused location permission explains it and links to that setting", async () => {
  list = { ...LIST, permission: false, networks: [] };
  await openCard();
  expect(screen.getByText(/your location/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Location settings/ }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "privacy-location" });
});

it("reopening during a connection shows it still connecting", async () => {
  list = { ...LIST, attempt: { id: "BB", state: "connecting", error: null } };
  await openCard();
  expect(within(row("Saved place")).getByText("Connecting…")).toBeTruthy();
  fireEvent.click(within(row("Free cafe")).getByRole("button", { name: "Free cafe" }));
  expect(connects()).toEqual([]);
});

it("the list refreshes while open and doesn't move the row being typed in", async () => {
  await openCard();
  await typePassword("Neighbour", "half typed");
  const before = names();
  list = { ...LIST, networks: [net("FF", "New and strong", { signal: 99 }), ...LIST.networks.filter((n) => n.id !== "CC")] };
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(names().slice(0, before.length - 1)).toEqual(before.filter((n) => n !== "New and strong").slice(0, before.length - 1));
  expect(names()).toContain("New and strong");
  expect((screen.getByLabelText("Password for Neighbour") as HTMLInputElement).value).toBe("half typed");
});

it("a name with odd characters is shown as it is", async () => {
  list = { ...LIST, networks: [net("11", "Café <☕> & co")] };
  await openCard();
  expect(screen.getByText("Café <☕> & co")).toBeTruthy();
});

it("connecting and disconnecting tell the dock's tile", async () => {
  await openCard();
  list = { ...LIST, networks: LIST.networks.map((n) => ({ ...n, connected: n.id === "BB" })) };
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(emit).toHaveBeenCalledWith("provider-refresh", "status");
});
