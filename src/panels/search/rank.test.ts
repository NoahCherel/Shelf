import { rank, type SearchItem } from "./rank";

const item = (name: string, kind: SearchItem["kind"] = "app"): SearchItem => ({ id: `${kind}:${name}`, name, kind });
const names = (items: SearchItem[]) => items.map((i) => i.name);

it("a name's start beats a word's start beats anywhere", () => {
  const items = [item("Notepad"), item("Open Note"), item("Keynote"), item("Paint")];
  expect(names(rank("note", items, {}))).toEqual(["Notepad", "Open Note", "Keynote"]);
});

it("matching ignores case and accents", () => {
  expect(names(rank("cafe", [item("CAFÉ du coin")], {}))).toEqual(["CAFÉ du coin"]);
  expect(names(rank("CAFÉ", [item("cafe")], {}))).toEqual(["cafe"]);
});

it("what you open more often ranks higher", () => {
  const items = [item("Calculator"), item("Calendar")];
  expect(names(rank("cal", items, {}))).toEqual(["Calculator", "Calendar"]);
  expect(names(rank("cal", items, { Calendar: 3 }))).toEqual(["Calendar", "Calculator"]);
});

it("history doesn't lift a weaker match over a better one", () => {
  const items = [item("Keynote"), item("Notepad")];
  expect(names(rank("note", items, { Keynote: 50 }))).toEqual(["Notepad", "Keynote"]);
});

it("an empty query shows recent items, then nothing", () => {
  const items = [item("Paint"), item("Notepad"), item("Word")];
  expect(names(rank("", items, { Word: 1, Notepad: 4 }))).toEqual(["Notepad", "Word"]);
  expect(rank("  ", items, {})).toEqual([]);
});

it("spaces around the text don't matter", () => {
  expect(names(rank("  paint ", [item("Paint")], {}))).toEqual(["Paint"]);
});
