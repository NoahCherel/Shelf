import { vi } from "vitest";
import { resolveAccent } from "./look";

vi.mock("./tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

it("uses the album colour when following the cover", () => {
  expect(resolveAccent("album", "#123456")).toBe("#123456");
});

it("falls back to the default accent with no album colour", () => {
  expect(resolveAccent("album", null)).toBeNull();
});

it("an own colour ignores the album", () => {
  expect(resolveAccent("#ff0000", "#123456")).toBe("#ff0000");
  expect(resolveAccent(null, "#123456")).toBeNull();
});
