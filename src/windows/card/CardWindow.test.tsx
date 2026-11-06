import { act, render } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { invoke, listen } from "../../core/tauri";
import { CardWindow } from "./CardWindow";

const handlers = new Map<string, (payload: unknown) => void>();
vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async (name: string, handler: (payload: unknown) => void) => {
    handlers.set(name, handler);
    return () => {};
  }),
  emit: vi.fn(async () => {}),
}));

const hide = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(listen).mockClear();
  handlers.clear();
});

it("a card hidden by something else counts as closed, so the next click opens it rather than closing it", async () => {
  render(<CardWindow />);
  await act(async () => {});
  act(() => handlers.get("card-open")?.("__menu:clock"));
  hide(true);
  expect(invoke).toHaveBeenCalledWith("close_card");
  hide(false);
});

it("with no card showing, being hidden changes nothing", async () => {
  render(<CardWindow />);
  await act(async () => {});
  hide(true);
  expect(invoke).not.toHaveBeenCalledWith("close_card");
  hide(false);
});
