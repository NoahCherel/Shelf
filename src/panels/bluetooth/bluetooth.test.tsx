import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { BluetoothCard } from "./BluetoothCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const DEVICES = [
  { id: "a", name: "WH-1000XM5", connected: true },
  { id: "b", name: "MX Master 3", connected: false },
];

let radios = [{ kind: "bluetooth", on: true }];
let devices = DEVICES;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  radios = [{ kind: "bluetooth", on: true }];
  devices = DEVICES;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "radios_state") return radios;
    if (cmd === "bluetooth_devices") return devices;
    return null;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<BluetoothCard />);
  await flush();
  return view;
}

const power = () => screen.getByRole("switch", { name: "Bluetooth" });

it("lists paired devices and which are connected", async () => {
  await openCard();
  expect(screen.getByText("WH-1000XM5")).toBeTruthy();
  expect(screen.getByText("Connected")).toBeTruthy();
  expect(screen.getByText("Paired")).toBeTruthy();
});

it("the switch turns Bluetooth off", async () => {
  await openCard();
  expect(power().getAttribute("aria-checked")).toBe("true");
  fireEvent.click(power());
  expect(mockInvoke).toHaveBeenCalledWith("radio_set", { kind: "bluetooth", on: false });
});

it("a switch that fails goes back and says why", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "radio_set") throw "Windows didn't allow Shelf to change this radio.";
    if (cmd === "radios_state") return radios;
    return devices;
  });
  await openCard();
  fireEvent.click(power());
  await flush();
  expect(power().getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText(/didn't allow Shelf/)).toBeTruthy();
});

it("off, it says so and keeps the switch", async () => {
  radios = [{ kind: "bluetooth", on: false }];
  devices = [];
  await openCard();
  expect(power().getAttribute("aria-checked")).toBe("false");
  expect(screen.getByText(/Bluetooth is off/)).toBeTruthy();
});

it("no paired devices points to Settings", async () => {
  devices = [];
  await openCard();
  expect(screen.getByText(/No paired devices/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Add or connect a device/ }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "bluetooth" });
});

it("a PC with no Bluetooth says so, without a switch", async () => {
  radios = [];
  devices = [];
  await openCard();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getByText(/no Bluetooth/)).toBeTruthy();
});

it("a device row goes to Settings, as Windows has no public way to connect", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "MX Master 3" }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "bluetooth" });
});
