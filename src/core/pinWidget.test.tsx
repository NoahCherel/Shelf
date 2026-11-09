import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "./tauri";
import { useLayout } from "./layout";
import { byId } from "./registry";
import { appFor, isPinId, parsePin, pinId } from "./pinWidget";
import { validStartImage } from "./startImage";
import { WidgetChoices } from "../windows/picker/AppChoices";
import { AppsTile } from "../widgets/apps/Tile";

vi.mock("./tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const entry = (key: string, open = false) => ({ key, name: key, pinned: true, active: false, windows: open ? [{ hwnd: 1, title: "w" }] : [] });

function backend(answers: Record<string, unknown>) {
  mockInvoke.mockImplementation(async (cmd) => answers[cmd] ?? null);
}

beforeEach(() => {
  mockInvoke.mockReset();
  backend({});
  useLayout.setState({ ids: [], positions: {} });
});

it("names a widget by what it opens, without backslashes that would break a selector", () => {
  const id = pinId("folder", "C:\\Users\\me\\Work");
  expect(id).toBe("pin:folder:C:/Users/me/Work");
  expect(isPinId(id)).toBe(true);
  expect(parsePin(id)).toEqual({ kind: "folder", target: "C:/Users/me/Work" });
  expect(isPinId("pin:other:x")).toBe(false);
  expect(isPinId("clock-and-weather")).toBe(false);
  expect(isPinId("pin:app:")).toBe(false);
});

it("finds an app's widget by the app's id or by its program", () => {
  expect(appFor("Mozilla.Firefox!App", [entry("mozilla.firefox!app", true)])?.key).toBe("mozilla.firefox!app");
  expect(appFor("{6D809377-6AF0-444B-8957-A3773F02200E}/Tool/tool.exe", [entry("c:\\program files\\tool\\tool.exe")])?.key).toBe("c:\\program files\\tool\\tool.exe");
  expect(appFor("other", [entry("mozilla.firefox!app")])).toBeUndefined();
  const group = { ...entry("group:1"), kind: "group" as const, members: [entry("inside", true)] };
  expect(appFor("inside", [group])?.key).toBe("inside");
});

it("a saved widget for an app is kept, and an unknown one is dropped", async () => {
  backend({ store_load: { version: 2, ids: ["pin:app:paint", "no-such-widget"] } });
  await useLayout.getState().load();
  expect(useLayout.getState().ids).toEqual(["pin:app:paint"]);
});

it("gives the same widget for the same id, so its tile isn't remade", () => {
  expect(byId("pin:app:paint")).toBe(byId("pin:app:paint"));
  expect(byId("pin:nope:x")).toBeUndefined();
});

function tile(id: string, data: ReturnType<typeof entry>[] | null = []) {
  const def = byId(id)!;
  const T = def.Tile;
  return render(<T data={data} status="ready" />);
}

it("opens what it stands for when closed, and shows the running app when open", async () => {
  tile("pin:app:paint");
  await act(async () => {});
  fireEvent.click(screen.getByRole("button"));
  expect(mockInvoke).toHaveBeenCalledWith("pin_widget_open", { id: "pin:app:paint" });
  mockInvoke.mockClear();
  document.body.innerHTML = "";
  const { container } = tile("pin:app:paint", [entry("paint", true)]);
  await act(async () => {});
  expect(container.querySelector(".app__dot")).toBeTruthy();
  fireEvent.click(container.querySelector("button")!);
  expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "paint" });
});

it("leaves the dock when what it opens is gone", async () => {
  useLayout.setState({ ids: ["pin:folder:C:/gone"], positions: {} });
  backend({ pin_widget_info: { name: "gone", gone: true } });
  tile("pin:folder:C:/gone");
  await waitFor(() => expect(useLayout.getState().ids).toEqual([]));
});

it("shows the name it's told once known", async () => {
  backend({ pin_widget_info: { name: "Paint", gone: false } });
  tile("pin:app:paint");
  expect(await screen.findByRole("button", { name: "Paint" })).toBeTruthy();
});

it("offers every installed app and adds one to the dock", async () => {
  backend({ search_apps: [{ id: "app:{GUID}\\a.exe", name: "Alpha", kind: "app" }, { id: "app:b", name: "Beta", kind: "app" }] });
  render(<WidgetChoices query="" />);
  fireEvent.click(await screen.findByRole("button", { name: "Alpha" }));
  expect(useLayout.getState().ids).toEqual(["pin:app:{GUID}/a.exe"]);
  expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
});

it("narrows the apps by what's typed", async () => {
  backend({ search_apps: [{ id: "app:a", name: "Alpha", kind: "app" }, { id: "app:b", name: "Beta", kind: "app" }] });
  render(<WidgetChoices query="bet" />);
  expect(await screen.findByRole("button", { name: "Beta" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
});

it("adds a folder chosen in Windows' dialog, and nothing if it's cancelled", async () => {
  backend({ search_apps: [] });
  render(<WidgetChoices query="" />);
  fireEvent.click(await screen.findByRole("button", { name: "Add a folder…" }));
  await act(async () => {});
  expect(useLayout.getState().ids).toEqual([]);
  backend({ search_apps: [], pick_folder: "C:\\Work" });
  fireEvent.click(screen.getByRole("button", { name: "Add a folder…" }));
  await waitFor(() => expect(useLayout.getState().ids).toEqual(["pin:folder:C:/Work"]));
});

it("accepts only a reasonable PNG as the Start image", () => {
  expect(validStartImage("data:image/png;base64,AAAA")).toBe(true);
  expect(validStartImage("data:text/html;base64,AAAA")).toBe(false);
  expect(validStartImage("https://example.com/a.png")).toBe(false);
  expect(validStartImage(`data:image/png;base64,${"A".repeat(1_000_000)}`)).toBe(false);
  expect(validStartImage(undefined)).toBe(false);
});

it("Start shows the chosen image, and its logo otherwise", async () => {
  const { container, unmount } = render(<AppsTile data={[]} status="ready" />);
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Start" }).querySelector("svg")).toBeTruthy();
  unmount();
  backend({ store_load: { data: "data:image/png;base64,AAAA" } });
  const again = render(<AppsTile data={[]} status="ready" />);
  await waitFor(() => expect(again.container.querySelector('[aria-label="Start"] img')?.getAttribute("src")).toBe("data:image/png;base64,AAAA"));
  expect(container).toBeTruthy();
});
