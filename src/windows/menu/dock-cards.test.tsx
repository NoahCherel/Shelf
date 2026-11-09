import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { AppMenu } from "./AppMenu";
import { GroupCard } from "./GroupCard";
import { StackCard } from "./StackCard";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}) }));

const mockInvoke = vi.mocked(invoke);

const member = (key: string, open = false) => ({ key, name: `App ${key}`, pinned: true, active: false, windows: open ? [{ hwnd: 1, title: "w" }] : [] });
const group = { key: "group:1", name: "Work", pinned: true, active: false, kind: "group", windows: [], members: [member("a", true), member("b")] };

function backend(answers: Record<string, unknown>) {
  mockInvoke.mockImplementation(async (cmd) => answers[cmd] ?? null);
}

beforeEach(() => {
  mockInvoke.mockReset();
  backend({ apps_list: [group] });
});

it("shows a group's apps, and opening one closes the card", async () => {
  render(<GroupCard groupKey="group:1" />);
  fireEvent.click(await screen.findByRole("button", { name: "App b" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_activate", { key: "b" });
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("close_card"));
});

it("marks the apps of a group that are open", async () => {
  const { container } = render(<GroupCard groupKey="group:1" />);
  await screen.findByRole("button", { name: "App a" });
  expect(container.querySelectorAll(".dcard-group__dot").length).toBe(1);
});

it("renames a group when the name is left, only if it changed", async () => {
  render(<GroupCard groupKey="group:1" />);
  const name = await screen.findByRole("textbox", { name: "Group name" });
  fireEvent.blur(name);
  expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_group_rename")).toEqual([]);
  fireEvent.change(name, { target: { value: "Games" } });
  fireEvent.blur(name);
  expect(mockInvoke).toHaveBeenCalledWith("apps_group_rename", { key: "group:1", name: "Games" });
});

it("right-clicking an app of a group shows that app's menu in the card", async () => {
  backend({ apps_list: [group], apps_menu: { items: [{ id: "leave-group", label: "Sortir du groupe" }] } });
  render(<GroupCard groupKey="group:1" />);
  fireEvent.contextMenu(await screen.findByRole("button", { name: "App a" }));
  expect(await screen.findByRole("menuitem", { name: "Sortir du groupe" })).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledWith("apps_menu", { key: "a" });
});

it("closes the card if the group has gone", async () => {
  backend({ apps_list: [] });
  render(<GroupCard groupKey="group:1" />);
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("close_card"));
});

it("opening a group from its menu shows its apps rather than asking Rust", async () => {
  backend({ apps_list: [group], apps_menu: { items: [{ id: "open", label: "Work" }, { id: "ungroup", label: "Ungroup" }] } });
  render(<AppMenu appKey="group:1" />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Work" }));
  expect(await screen.findByRole("button", { name: "App a" })).toBeTruthy();
  expect(mockInvoke.mock.calls.filter((c) => c[0] === "apps_menu_choose")).toEqual([]);
});

it("lists what a folder holds and opens a line by its id", async () => {
  backend({ apps_stack: { items: [{ id: "00aa", label: "Photos", folder: true }, { id: "00bb", label: "a.txt", folder: false }], more: false } });
  render(<StackCard folderKey="item:x" />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "a.txt" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_stack_open", { key: "item:x", id: "00bb" });
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("close_card"));
});

it("says when a folder holds more than is shown, and can open the folder itself", async () => {
  backend({ apps_stack: { items: [{ id: "00aa", label: "a", folder: false }], more: true } });
  render(<StackCard folderKey="item:x" />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Open folder to see more" }));
  expect(mockInvoke).toHaveBeenCalledWith("apps_menu_choose", { key: "item:x", id: "open" });
});

it("says when a folder is empty", async () => {
  backend({ apps_stack: { items: [], more: false } });
  render(<StackCard folderKey="item:x" />);
  expect(await screen.findByText("This folder is empty")).toBeTruthy();
});
