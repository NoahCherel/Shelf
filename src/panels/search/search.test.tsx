import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { invoke, listen } from "../../core/tauri";
import { CardWindow } from "../../windows/card/CardWindow";
import { SearchCard } from "./SearchCard";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

const mockInvoke = vi.mocked(invoke);

const APPS = [
  { id: "app:paint", name: "Paint", kind: "app" },
  { id: "app:notepad", name: "Notepad", kind: "app" },
  { id: "app:photos", name: "Photos", kind: "app" },
];

let files: (query: string) => Promise<unknown> = async () => [];
let history: Record<string, number> | null = null;
let recentSearches: string[] | null = null;
let recentFiles: unknown[] = [];

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  files = async () => [];
  history = null;
  recentSearches = null;
  recentFiles = [];
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd, args) => {
    if (cmd === "search_apps") return APPS;
    if (cmd === "search_files") return files((args as { query: string }).query);
    if (cmd === "store_load") return (args as { name: string }).name === "search-recent" ? recentSearches : history;
    if (cmd === "search_recent_files") return recentFiles;
    return null;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<SearchCard />);
  await flush();
  return view;
}

const box = () => screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const rows = () => screen.queryAllByRole("option").map((o) => o.querySelector(".search__name")?.textContent);
const selected = () => screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true")?.querySelector(".search__name")?.textContent;
const fileCalls = () => mockInvoke.mock.calls.filter((c) => c[0] === "search_files");

it("the box has focus as soon as the card opens", async () => {
  await openCard();
  expect(document.activeElement).toBe(box());
});

it("typing shows matching apps first and the web last", async () => {
  await openCard();
  type("pa");
  expect(rows()).toEqual(["Paint", "Notepad", "Search the web for “pa”"]);
});

it("arrows move the selection and Enter opens it", async () => {
  await openCard();
  type("p");
  expect(selected()).toBe("Paint");
  fireEvent.keyDown(box(), { key: "ArrowDown" });
  expect(selected()).toBe("Photos");
  fireEvent.keyDown(box(), { key: "ArrowUp" });
  expect(selected()).toBe("Paint");
  fireEvent.keyDown(box(), { key: "ArrowUp" });
  expect(selected()).toBe("Search the web for “p”");
  fireEvent.keyDown(box(), { key: "ArrowDown" });
  fireEvent.keyDown(box(), { key: "Enter" });
  expect(mockInvoke).toHaveBeenCalledWith("search_open", { id: "app:paint" });
});

it("opening something closes the card and remembers its name", async () => {
  await openCard();
  type("paint");
  fireEvent.keyDown(box(), { key: "Enter" });
  await flush();
  expect(mockInvoke).toHaveBeenCalledWith("store_save", { name: "search-history", value: { Paint: 1 } });
  expect(mockInvoke).toHaveBeenCalledWith("close_card");
});

it("what couldn't be opened stays open", async () => {
  mockInvoke.mockImplementation(async (cmd) => {
    if (cmd === "search_open") throw "preview";
    if (cmd === "search_apps") return APPS;
    return null;
  });
  await openCard();
  type("paint");
  fireEvent.keyDown(box(), { key: "Enter" });
  await flush();
  expect(mockInvoke).not.toHaveBeenCalledWith("close_card");
});

it("Escape closes the card", async () => {
  render(<CardWindow />);
  await flush();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(mockInvoke).toHaveBeenCalledWith("close_card");
  expect(vi.mocked(listen)).toHaveBeenCalled();
});

it("the last row searches the web for the text", async () => {
  await openCard();
  type("météo & vent");
  fireEvent.click(screen.getByText("Search the web for “météo & vent”"));
  expect(mockInvoke).toHaveBeenCalledWith("search_web", { query: "météo & vent" });
});

it("files are asked for only after a 150 ms pause in typing", async () => {
  await openCard();
  type("re");
  await act(() => vi.advanceTimersByTimeAsync(100));
  type("rep");
  await act(() => vi.advanceTimersByTimeAsync(149));
  expect(fileCalls()).toEqual([]);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(fileCalls().map((c) => (c[1] as { query: string }).query)).toEqual(["rep"]);
});

it("a single letter doesn't search files", async () => {
  await openCard();
  type("r");
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(fileCalls()).toEqual([]);
});

it("file results from an older query never replace newer ones", async () => {
  let finishOld: (v: unknown) => void = () => {};
  files = (query) =>
    query === "rep"
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve([{ id: "file:2", name: "report final.pdf", kind: "file", detail: "Documents" }]);
  await openCard();
  type("rep");
  await act(() => vi.advanceTimersByTimeAsync(150));
  type("report");
  await act(() => vi.advanceTimersByTimeAsync(150));
  await act(async () => finishOld([{ id: "file:1", name: "report old.pdf", kind: "file", detail: "Documents" }]));
  expect(rows()).toContain("report final.pdf");
  expect(rows()).not.toContain("report old.pdf");
});

it("each file search carries a newer ticket", async () => {
  await openCard();
  type("rep");
  await act(() => vi.advanceTimersByTimeAsync(150));
  type("repo");
  await act(() => vi.advanceTimersByTimeAsync(150));
  const tickets = fileCalls().map((c) => (c[1] as { ticket: number }).ticket);
  expect(tickets[1]).toBeGreaterThan(tickets[0]);
});

it("reopening the card keeps tickets rising, as Rust remembers the highest", async () => {
  const first = await openCard();
  type("rep");
  await act(() => vi.advanceTimersByTimeAsync(150));
  first.unmount();
  await openCard();
  type("rep");
  await act(() => vi.advanceTimersByTimeAsync(150));
  const tickets = fileCalls().map((c) => (c[1] as { ticket: number }).ticket);
  expect(tickets).toHaveLength(2);
  expect(tickets[1]).toBeGreaterThan(tickets[0]);
});

it("a failed file search still shows apps and the web row", async () => {
  files = async () => {
    throw "index down";
  };
  await openCard();
  type("paint");
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(rows()).toEqual(["Paint", "Search the web for “paint”"]);
});

it("an empty box shows what was opened recently", async () => {
  history = { Notepad: 2 };
  await openCard();
  expect(rows()).toEqual(["Notepad"]);
});

it("results render as text, never HTML", async () => {
  files = async () => [{ id: "file:x", name: "pa<img src=x onerror=alert(1)>.txt", kind: "file", detail: "<b>Docs</b>" }];
  await openCard();
  type("pa<img");
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(document.querySelector("img[src='x']")).toBeNull();
  expect(screen.getByText("pa<img src=x onerror=alert(1)>.txt")).toBeTruthy();
});

describe("with an empty box", () => {
  const FILE = { id: "file:r", name: "budget.xlsx", kind: "file" };

  it("shows recent searches, apps and files", async () => {
    recentSearches = ["facture"];
    history = { Notepad: 2 };
    recentFiles = [FILE];
    await openCard();
    expect(rows()).toEqual(["facture", "Notepad", "budget.xlsx"]);
    expect(screen.getByText("RECENT SEARCHES")).toBeTruthy();
    expect(screen.getByText("RECENT FILES")).toBeTruthy();
  });

  it("nothing recent shows no headings", async () => {
    await openCard();
    expect(rows()).toEqual([]);
    expect(screen.queryByText("RECENT FILES")).toBeNull();
  });

  it("a recent file opens", async () => {
    recentFiles = [FILE];
    await openCard();
    fireEvent.click(screen.getByText("budget.xlsx"));
    expect(mockInvoke).toHaveBeenCalledWith("search_open", { id: "file:r" });
  });

  it("recent files go once there's text to search", async () => {
    recentFiles = [FILE];
    await openCard();
    type("paint");
    expect(rows()).not.toContain("budget.xlsx");
  });

  it("a recent search fills the box rather than opening anything", async () => {
    recentSearches = ["facture"];
    await openCard();
    fireEvent.click(screen.getByText("facture"));
    expect(box().value).toBe("facture");
    expect(mockInvoke).not.toHaveBeenCalledWith("close_card");
    expect(document.activeElement).toBe(box());
  });

  it("Enter on a recent search fills the box too", async () => {
    recentSearches = ["facture"];
    await openCard();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(box().value).toBe("facture");
    expect(mockInvoke).not.toHaveBeenCalledWith("search_web", expect.anything());
  });

  it("a recent search can be removed", async () => {
    recentSearches = ["facture", "impots"];
    await openCard();
    fireEvent.click(screen.getByRole("button", { name: "Remove facture" }));
    expect(mockInvoke).toHaveBeenCalledWith("store_save", { name: "search-recent", value: ["impots"] });
    expect(rows()).toEqual(["impots"]);
    expect(box().value).toBe("");
  });
});

describe("remembering a search", () => {
  const saved = () => mockInvoke.mock.calls.filter((c) => c[0] === "store_save" && (c[1] as { name: string }).name === "search-recent").map((c) => (c[1] as { value: string[] }).value);

  it("happens when something is opened from it, newest first", async () => {
    recentSearches = ["old"];
    await openCard();
    type("paint");
    fireEvent.keyDown(box(), { key: "Enter" });
    await flush();
    expect(saved()).toEqual([["paint", "old"]]);
  });

  it("doesn't happen just from typing", async () => {
    await openCard();
    type("secret thing");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(saved()).toEqual([]);
  });

  it("a web search counts", async () => {
    await openCard();
    type("météo");
    fireEvent.click(screen.getByText("Search the web for “météo”"));
    await flush();
    expect(saved()).toEqual([["météo"]]);
  });

  it("the same search isn't kept twice, whatever its case", async () => {
    recentSearches = ["Paint", "old"];
    await openCard();
    type("paint");
    fireEvent.keyDown(box(), { key: "Enter" });
    await flush();
    expect(saved()).toEqual([["paint", "old"]]);
  });

  it("only the last five are kept", async () => {
    recentSearches = ["a", "b", "c", "d", "e"];
    await openCard();
    type("paint");
    fireEvent.keyDown(box(), { key: "Enter" });
    await flush();
    expect(saved()).toEqual([["paint", "a", "b", "c", "d"]]);
  });
});
