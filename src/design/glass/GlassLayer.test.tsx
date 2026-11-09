import { beforeEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { invoke, listen } from "../../core/tauri";
import { GlassLayer, lookFor, watchTiles } from "./GlassLayer";
import { usesGlass } from "../theme";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const calls = (name: string) => mockInvoke.mock.calls.filter((c) => c[0] === name).length;

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  mockListen.mockClear();
});

describe("GlassLayer", () => {
  it("starts capture when active", async () => {
    render(<GlassLayer active />);
    await waitFor(() => expect(calls("glass_start")).toBe(1));
    expect(calls("glass_stop")).toBe(0);
  });

  it("doesn't start for a solid style", async () => {
    render(<GlassLayer active={false} />);
    await waitFor(() => expect(calls("glass_stop")).toBe(1));
    expect(calls("glass_start")).toBe(0);
  });

  it("stops when it stops being active, as for Black or fullscreen", async () => {
    const { rerender } = render(<GlassLayer active />);
    await waitFor(() => expect(calls("glass_start")).toBe(1));
    rerender(<GlassLayer active={false} />);
    await waitFor(() => expect(calls("glass_stop")).toBeGreaterThan(0));
  });

  it("stops when removed, leaving no capture running", async () => {
    const { unmount } = render(<GlassLayer active />);
    await waitFor(() => expect(calls("glass_start")).toBe(1));
    unmount();
    await waitFor(() => expect(calls("glass_stop")).toBe(1));
  });

  it("draws no canvas when inactive", () => {
    const { container } = render(<GlassLayer active={false} />);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("tells the parent when capture isn't possible, so it can fall back", async () => {
    mockInvoke.mockRejectedValue("no capture here");
    const onUnavailable = vi.fn();
    render(<GlassLayer active onUnavailable={onUnavailable} />);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });

  it("collects a frame when told one is ready", async () => {
    render(<GlassLayer active />);
    await waitFor(() => expect(mockListen).toHaveBeenCalledWith("glass-frame", expect.any(Function)));
    const fire = mockListen.mock.calls.find((c) => c[0] === "glass-frame")![1] as () => void;
    await act(async () => fire());
    expect(calls("glass_frame")).toBe(1);
  });
});

describe("glass for each style", () => {
  it("only the glass styles capture the screen, and Clear only when frosted", () => {
    expect(["liquid", "ios", "midnight", "black", "white"].map((s) => usesGlass(s as never, "frosted", false))).toEqual([true, true, false, false, false]);
    expect(usesGlass("clear", "frosted", false)).toBe(true);
    expect(usesGlass("clear", "black", false)).toBe(false);
  });

  it("iOS Glass is tinted more deeply than Liquid Glass", () => {
    expect(lookFor("ios", "dark").tintAmount).toBeGreaterThan(lookFor("liquid", "dark").tintAmount + 0.2);
    expect(lookFor("ios", "light").tint).toEqual([1, 1, 1]);
  });

  it("Clear draws only under its tiles", () => {
    expect(lookFor("clear", "dark").clearOutside).toBe(1);
    expect(lookFor("liquid", "dark").clearOutside).toBe(0);
  });

  it("switching between glass styles keeps the same capture running", async () => {
    document.documentElement.dataset.style = "liquid";
    render(
      <div className="dock">
        <GlassLayer active />
      </div>,
    );
    await waitFor(() => expect(calls("glass_start")).toBe(1));
    act(() => {
      document.documentElement.dataset.style = "ios";
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls("glass_start")).toBe(1);
    expect(calls("glass_stop")).toBe(0);
  });
});

describe("tiles that move", () => {
  it("are followed by the glass, so nothing is left where a tile was", async () => {
    const bar = document.createElement("div");
    const tile = document.createElement("div");
    bar.appendChild(tile);
    document.body.appendChild(bar);
    const moved = vi.fn();
    const stop = watchTiles(bar, moved);
    tile.style.left = "120px";
    await new Promise((r) => setTimeout(r, 40));
    expect(moved).toHaveBeenCalled();
    stop();
    moved.mockClear();
    tile.style.left = "300px";
    await new Promise((r) => setTimeout(r, 40));
    expect(moved).not.toHaveBeenCalled();
    bar.remove();
  });
});
