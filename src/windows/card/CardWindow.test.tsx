import { vi } from "vitest";
import { fitFor } from "./CardWindow";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

describe("fitting the window to what it shows", () => {
  it("an empty card, as an app's menu before its rows come, never asks for no size at all", () => {
    expect(fitFor(undefined, 0, 0)).toBeNull();
    expect(fitFor(undefined, 240, 0)).toBeNull();
    expect(fitFor(340, 0, 0)).toBeNull();
  });

  it("once there's something, the window takes its size, or the card's own width", () => {
    expect(fitFor(undefined, 240, 130)).toEqual({ width: 240, height: 130 });
    expect(fitFor(340, 200, 300)).toEqual({ width: 340, height: 300 });
  });
});
