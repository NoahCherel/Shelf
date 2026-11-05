import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import status from "../../widgets/system-status/index";
import { SoundCard } from "./SoundCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const STATE = {
  volume: 40,
  muted: false,
  device: "Speakers",
  devices: [
    { id: "a", name: "Speakers", active: true },
    { id: "b", name: "Headset", active: false },
  ],
  apps: [{ pid: 7, name: "Firefox", volume: 80, muted: false, exe: "C:\\firefox.exe" }],
};

let state = STATE;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  state = STATE;
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => (cmd === "audio_state" ? state : null));
});

afterEach(() => {
  vi.useRealTimers();
});

const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;

async function openCard() {
  const view = render(<SoundCard />);
  await flush();
  return view;
}

it("shows volume, each app's volume and the outputs", async () => {
  await openCard();
  expect(slider("Volume").value).toBe("40");
  expect(slider("Firefox").value).toBe("80");
  expect(screen.getByRole("radio", { name: "Speakers" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("radio", { name: "Headset" }).getAttribute("aria-checked")).toBe("false");
});

it("the master slider sets the volume", async () => {
  await openCard();
  fireEvent.change(slider("Volume"), { target: { value: "55" } });
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_volume", { percent: 55 });
});

it("an app's slider sets that app's volume", async () => {
  await openCard();
  fireEvent.change(slider("Firefox"), { target: { value: "30" } });
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_app_volume", { pid: 7, percent: 30 });
});

it("a fast drag sends at most one change every 40 ms, ending on the last value", async () => {
  await openCard();
  for (const value of ["50", "51", "52", "53"]) fireEvent.change(slider("Volume"), { target: { value } });
  const sets = () => mockInvoke.mock.calls.filter((c) => c[0] === "audio_set_volume").map((c) => (c[1] as { percent: number }).percent);
  expect(sets()).toEqual([50]);
  await act(() => vi.advanceTimersByTimeAsync(40));
  expect(sets()).toEqual([50, 53]);
});

it("a poll arriving mid-drag doesn't move the slider", async () => {
  await openCard();
  fireEvent.pointerDown(slider("Volume"));
  fireEvent.change(slider("Volume"), { target: { value: "70" } });
  state = { ...STATE, volume: 12 };
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(slider("Volume").value).toBe("70");
  fireEvent.pointerUp(document);
});

it("the speaker icon mutes and unmutes", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_mute", { muted: true });
});

it("a muted device offers to unmute, and says so", async () => {
  state = { ...STATE, muted: true };
  await openCard();
  fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_mute", { muted: false });
});

it("choosing an output marks it", async () => {
  await openCard();
  fireEvent.click(screen.getByRole("radio", { name: "Headset" }));
  expect(mockInvoke).toHaveBeenCalledWith("audio_set_output", { id: "b" });
  expect(screen.getByRole("radio", { name: "Headset" }).getAttribute("aria-checked")).toBe("true");
});

it("an output that can't be switched goes back and links to Settings", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "audio_set_output") throw "nope";
    return cmd === "audio_state" ? state : null;
  });
  await openCard();
  fireEvent.click(screen.getByRole("radio", { name: "Headset" }));
  await flush();
  expect(screen.getByRole("radio", { name: "Speakers" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText(/Windows wouldn't switch/)).toBeTruthy();
});

it("no sound device shows a plain message and a Settings link", async () => {
  state = { ...STATE, device: null, devices: [], apps: [] } as unknown as typeof STATE;
  await openCard();
  expect(screen.getByText(/No sound device/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Sound settings/ })).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});

it("a device unplugged while open drops from the list without breaking", async () => {
  await openCard();
  state = { ...STATE, devices: [STATE.devices[0]] };
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.queryByRole("radio", { name: "Headset" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Speakers" })).toBeTruthy();
});

it("a reading that fails doesn't blank the card", async () => {
  await openCard();
  mockInvoke.mockImplementation(async () => {
    throw "gone";
  });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(slider("Volume").value).toBe("40");
});

describe("on the tile", () => {
  const T = status.Tile;
  const DATA = { wifi: null, online: true, volume: { percent: 40, muted: false }, battery: null };
  const part = () => screen.getByRole("button", { name: "Sound" });

  it("scrolling on the Sound icon changes the volume by 2", () => {
    render(<T data={DATA} status="ready" />);
    fireEvent.wheel(part(), { deltaY: -100 });
    expect(mockInvoke).toHaveBeenCalledWith("audio_set_volume", { percent: 42 });
    fireEvent.wheel(part(), { deltaY: 100 });
    expect(mockInvoke).toHaveBeenLastCalledWith("audio_set_volume", { percent: 40 });
  });

  it("scrolling doesn't go past 0 or 100", () => {
    render(<T data={{ ...DATA, volume: { percent: 100, muted: false } }} status="ready" />);
    fireEvent.wheel(part(), { deltaY: -100 });
    expect(mockInvoke).toHaveBeenCalledWith("audio_set_volume", { percent: 100 });
  });

  it("does nothing in the picker", () => {
    render(<T data={DATA} status="sample" preview />);
    fireEvent.wheel(part(), { deltaY: -100 });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
