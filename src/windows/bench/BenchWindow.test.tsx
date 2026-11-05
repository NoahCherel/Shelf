import { readFileSync } from "node:fs";
import { afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { freezeClock } from "./prepare";
import { scenes } from "./scenes";
import { BenchWindow } from "./BenchWindow";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
  installFakeBackend: vi.fn(),
  appVersion: vi.fn(async () => "1.0.0"),
}));

afterEach(() => window.history.pushState({}, "", "/"));

it("an unknown scene says so instead of rendering blank", () => {
  window.history.pushState({}, "", "/?w=bench&scene=nope");
  render(<BenchWindow />);
  expect(screen.getByText(/No scene called "nope"/)).toBeTruthy();
});

it("Date.now is frozen in a scene, so clocks and countdowns render the same every time", () => {
  const restore = freezeClock(1_000_000);
  expect(Date.now()).toBe(1_000_000);
  expect(new Date().getTime()).toBe(1_000_000);
  expect(new Date(5).getTime()).toBe(5);
  expect(new Date(2026, 0, 2).getFullYear()).toBe(2026);
  restore();
  expect(Date.now()).toBeGreaterThan(1_000_000);
});

it("main.tsx reaches the bench only through a dynamic import", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).not.toMatch(/^import .*windows\/bench/m);
  expect(main).toMatch(/import\("\.\/windows\/bench/);
});

it("scene ids are unique, with the first scenes present", () => {
  const ids = scenes.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ["dock-default", "dock-light", "dock-focus", "dock-apps-many", "card-claude", "card-date", "menu", "picker", "settings-dock"]) {
    expect(ids).toContain(id);
  }
});
