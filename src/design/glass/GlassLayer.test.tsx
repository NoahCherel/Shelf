import { beforeEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { invoke, listen } from "../../core/tauri";
import { GlassLayer } from "./GlassLayer";
import { lensOffset } from "./lens";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);
const calls = (name: string) => mockInvoke.mock.calls.filter((c) => c[0] === name).length;

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  mockListen.mockClear();
});

describe("lens", () => {
  const BAND = 26;
  const STRENGTH = 30;

  it("leaves the centre unmoved", () => {
    expect(lensOffset(-BAND, BAND, STRENGTH)).toBe(0);
    expect(lensOffset(-200, BAND, STRENGTH)).toBe(0);
  });

  it("displaces most at the rim", () => {
    expect(lensOffset(0, BAND, STRENGTH)).toBe(STRENGTH);
  });

  it("grows steadily toward the rim", () => {
    const near = lensOffset(-5, BAND, STRENGTH);
    const far = lensOffset(-20, BAND, STRENGTH);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
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
