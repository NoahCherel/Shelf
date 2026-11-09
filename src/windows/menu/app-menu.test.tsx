import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { AppMenu } from "./AppMenu";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const MENU = {
  items: [
    { id: "open", label: "Discord" },
    { id: "pin", label: "Épingler à la barre des tâches" },
    { id: "close", label: "Fermer la fenêtre" },
  ],
};

async function openMenu() {
  const view = render(<AppMenu appKey="discord" />);
  await act(async () => {});
  return view;
}

const row = (name: string) => screen.getByRole("menuitem", { name });

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "apps_menu") return MENU;
    if (cmd === "apps_icon") return "data:image/png;base64,AAAA";
    return null;
  });
});

it("shows what Rust offers for this app, in that order", async () => {
  await openMenu();
  expect(mockInvoke).toHaveBeenCalledWith("apps_menu", { key: "discord" });
  expect(screen.getAllByRole("menuitem").map((r) => r.textContent)).toEqual(["Discord", "Épingler à la barre des tâches", "Fermer la fenêtre"]);
});

it("every row has its icon: the app's own, then a glyph", async () => {
  await openMenu();
  expect(row("Discord").querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  expect(row("Épingler à la barre des tâches").querySelector("svg")).toBeTruthy();
  expect(row("Fermer la fenêtre").querySelector("svg")).toBeTruthy();
});

it("an app with no icon shows its initial", async () => {
  mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_menu" ? MENU : null));
  await openMenu();
  expect(row("Discord").textContent).toContain("Discord");
  expect(row("Discord").querySelector(".amenu__blank")?.textContent).toBe("D");
});

it("choosing runs it for this app, then closes the menu", async () => {
  await openMenu();
  fireEvent.click(row("Fermer la fenêtre"));
  await act(async () => {});
  expect(mockInvoke).toHaveBeenCalledWith("apps_menu_choose", { key: "discord", id: "close" });
  expect(mockInvoke).toHaveBeenCalledWith("close_card");
});

it("arrow keys move between rows and wrap", async () => {
  await openMenu();
  const rows = screen.getAllByRole("menuitem");
  rows[0].focus();
  fireEvent.keyDown(rows[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows[1]);
  fireEvent.keyDown(rows[1], { key: "ArrowUp" });
  fireEvent.keyDown(rows[0], { key: "ArrowUp" });
  expect(document.activeElement).toBe(rows[2]);
});

it("an app that has gone shows nothing rather than a broken menu", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "apps_menu") throw "app is gone";
    return null;
  });
  await openMenu();
  expect(screen.queryAllByRole("menuitem")).toEqual([]);
  expect(mockInvoke).toHaveBeenCalledWith("close_card");
});

describe("jump lists", () => {
  const WITH_LISTS = {
    sections: [{ title: "Tâches", items: [{ id: "jump:0123456789abcdef", label: "Nouvelle fenêtre privée" }] }],
    items: MENU.items,
  };

  beforeEach(() => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "apps_menu") return WITH_LISTS;
      if (cmd === "apps_icon") return "data:image/png;base64,AAAA";
      return null;
    });
  });

  it("show above the app's own items, under Windows' section name", async () => {
    await openMenu();
    expect(screen.getByText("Tâches")).toBeTruthy();
    const labels = screen.getAllByRole("menuitem").map((e) => e.textContent);
    expect(labels).toEqual(["Nouvelle fenêtre privée", "Discord", "Épingler à la barre des tâches", "Fermer la fenêtre"]);
  });

  it("a line sends only its fingerprint, and Rust does the rest", async () => {
    await openMenu();
    fireEvent.click(row("Nouvelle fenêtre privée"));
    expect(mockInvoke).toHaveBeenCalledWith("apps_menu_choose", { key: "discord", id: "jump:0123456789abcdef" });
  });

  it("an app with no jump list shows only its own items", async () => {
    mockInvoke.mockImplementation(async (cmd) => (cmd === "apps_menu" ? MENU : null));
    await openMenu();
    expect(screen.queryByText("Tâches")).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });
});

describe("a jump list's pictures and details", () => {
  beforeEach(() => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === "apps_menu")
        return {
          sections: [{ title: "Fréquents", items: [{ id: "jump:0123456789abcdef", label: "GitHub", detail: "https://github.com/" }] }],
          items: MENU.items,
        };
      if (cmd === "apps_menu_icons") return [["jump:0123456789abcdef", "data:image/png;base64,BBBB"]];
      if (cmd === "apps_icon") return "data:image/png;base64,AAAA";
      return null;
    });
  });

  it("each line gets its own picture once they come, and its details on hover", async () => {
    await openMenu();
    await act(async () => {});
    const line = row("GitHub");
    expect(line.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,BBBB");
    expect(line.getAttribute("title")).toBe("https://github.com/");
    expect(mockInvoke).toHaveBeenCalledWith("apps_menu_icons", { key: "discord" });
  });
});
