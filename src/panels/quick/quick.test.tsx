import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { QuickCard } from "./QuickCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const AUDIO = { volume: 40, muted: false, device: "Speakers", devices: [{ id: "a", name: "Speakers", active: true }], apps: [] };
const STATUS = { wifi: null, online: true, volume: null, battery: { percent: 64, charging: false } };
const RADIOS = [
  { kind: "wifi", on: true },
  { kind: "bluetooth", on: false },
];

let radios = RADIOS;
const TOGGLES = { airplane: false, dnd: false, night_light: true, energy_saver: false };
let toggles = TOGGLES as Record<string, boolean | null>;
let brightness: number | null = 70;
let status = STATUS as { wifi: null; online: boolean; volume: null; battery: { percent: number; charging: boolean } | null };

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  radios = RADIOS;
  brightness = 70;
  toggles = TOGGLES;
  status = STATUS;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "radios_state") return radios;
    if (cmd === "brightness_get") return brightness;
    if (cmd === "toggles_state") return toggles;
    if (cmd === "audio_state") return AUDIO;
    if (cmd === "system_status") return status;
    return null;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<QuickCard />);
  await flush();
  return view;
}

const toggle = (name: string) => screen.getByRole("switch", { name });
const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;

it("shows Wi-Fi and Bluetooth with their state", async () => {
  await openCard();
  expect(toggle("Wi-Fi").getAttribute("aria-checked")).toBe("true");
  expect(toggle("Bluetooth").getAttribute("aria-checked")).toBe("false");
});

it("a radio this PC doesn't have isn't shown", async () => {
  radios = [{ kind: "wifi", on: true }];
  await openCard();
  expect(screen.queryByRole("switch", { name: "Bluetooth" })).toBeNull();
});

it("flipping a switch sets that radio and shows it at once", async () => {
  await openCard();
  fireEvent.click(toggle("Bluetooth"));
  expect(mockInvoke).toHaveBeenCalledWith("radio_set", { kind: "bluetooth", on: true });
  expect(toggle("Bluetooth").getAttribute("aria-checked")).toBe("true");
});

it("the chevron on Wi-Fi moves to the Wi-Fi card", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Wi-Fi networks" }));
  expect(mockInvoke).toHaveBeenCalledWith("swap_card", { widgetId: "__panel:wifi", width: 340 });
});

it("Bluetooth's chevron moves to the Bluetooth card", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Bluetooth devices" }));
  expect(mockInvoke).toHaveBeenCalledWith("swap_card", { widgetId: "__panel:bluetooth", width: 340 });
});

it("a switch that fails goes back and says why", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "radio_set") throw "Windows didn't allow Shelf to change this radio.";
    if (cmd === "radios_state") return radios;
    if (cmd === "brightness_get") return brightness;
    if (cmd === "toggles_state") return toggles;
    if (cmd === "audio_state") return AUDIO;
    return status;
  });
  await openCard();
  fireEvent.click(toggle("Bluetooth"));
  await flush();
  expect(toggle("Bluetooth").getAttribute("aria-checked")).toBe("false");
  expect(screen.getByText(/didn't allow Shelf/)).toBeTruthy();
});

it("shows brightness and volume sliders", async () => {
  await openCard();
  expect(slider("Brightness").value).toBe("70");
  expect(slider("Volume").value).toBe("40");
  fireEvent.change(slider("Brightness"), { target: { value: "55" } });
  expect(mockInvoke).toHaveBeenCalledWith("brightness_set", { percent: 55 });
  fireEvent.change(slider("Volume"), { target: { value: "30" } });
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_volume", { percent: 30 });
});

it("no adjustable brightness hides that slider", async () => {
  brightness = null;
  await openCard();
  expect(screen.queryByRole("slider", { name: "Brightness" })).toBeNull();
  expect(screen.getByRole("button", { name: /Display/ })).toBeTruthy();
});

it("shows the battery", async () => {
  await openCard();
  expect(screen.getByText("64%")).toBeTruthy();
});

it("a machine with no battery hides that row", async () => {
  status = { ...STATUS, battery: null };
  await openCard();
  expect(screen.queryByText(/Battery/)).toBeNull();
  expect(screen.queryByRole("button", { name: /Energy saver/ })).toBeNull();
});

it("airplane mode, do not disturb, night light and energy saver are real switches", async () => {
  await openCard();
  expect(toggle("Night light").getAttribute("aria-checked")).toBe("true");
  for (const [name, kind, on] of [
    ["Airplane mode", "airplane", true],
    ["Do not disturb", "dnd", true],
    ["Night light", "night_light", false],
    ["Energy saver", "energy_saver", true],
  ] as const) {
    fireEvent.click(toggle(name));
    expect(mockInvoke).toHaveBeenCalledWith("toggle_set", { kind, on });
  }
});

it("no battery hides the energy saver switch", async () => {
  status = { ...STATUS, battery: null };
  toggles = { ...TOGGLES, energy_saver: null };
  await openCard();
  expect(screen.queryByRole("switch", { name: "Energy saver" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Energy saver/ })).toBeNull();
});

it("a setting Windows won't tell us about is a link, never a dead switch", async () => {
  toggles = { ...TOGGLES, night_light: null };
  await openCard();
  expect(screen.queryByRole("switch", { name: "Night light" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Night light" }));
  expect(mockInvoke).toHaveBeenCalledWith("open_settings", { page: "nightlight" });
});

it("a change Windows quietly ignores goes back to what's true", async () => {
  await openCard();
  fireEvent.click(toggle("Do not disturb"));
  expect(toggle("Do not disturb").getAttribute("aria-checked")).toBe("true");
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(toggle("Do not disturb").getAttribute("aria-checked")).toBe("false");
});

it("a setting that refuses says why", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "toggle_set") throw "Energy saver only turns on when running on battery.";
    if (cmd === "radios_state") return radios;
    if (cmd === "brightness_get") return brightness;
    if (cmd === "toggles_state") return toggles;
    if (cmd === "audio_state") return AUDIO;
    return status;
  });
  await openCard();
  fireEvent.click(toggle("Energy saver"));
  await flush();
  expect(toggle("Energy saver").getAttribute("aria-checked")).toBe("false");
  expect(screen.getByText(/running on battery/)).toBeTruthy();
});
