import { byCategory, collect, widgets } from "./registry";
import { defineWidget, widthOf } from "./widget";

const def = (id: string, category: "clocks" | "ai" = "clocks") =>
  defineWidget({ id, name: id, description: "", category, width: 1, Tile: () => null });

describe("collect", () => {
  it("finds _sample only in test mode", () => {
    const mods = { "../widgets/_sample/index.tsx": { default: def("sample") } };
    expect(collect(mods, "test").map((w) => w.id)).toEqual(["sample"]);
    expect(collect(mods, "production")).toEqual([]);
  });

  it("keeps ordinary folders in every mode", () => {
    const mods = { "../widgets/clock/index.tsx": { default: def("clock") } };
    expect(collect(mods, "production").map((w) => w.id)).toEqual(["clock"]);
  });

  it("throws on duplicate ids", () => {
    const mods = {
      "../widgets/a/index.tsx": { default: def("same") },
      "../widgets/b/index.tsx": { default: def("same") },
    };
    expect(() => collect(mods, "production")).toThrow(/same/);
  });

  it("throws on a folder that exports no widget", () => {
    expect(() => collect({ "../widgets/a/index.tsx": {} }, "production")).toThrow(/a\/index/);
  });
});

it("the real registry discovers the sample folder in tests", () => {
  expect(widgets.some((w) => w.id === "_sample")).toBe(true);
});

it("byCategory groups by category", () => {
  const groups = byCategory([def("x"), def("y", "ai"), def("z")]);
  expect(groups.get("clocks")?.map((w) => w.id)).toEqual(["x", "z"]);
  expect(groups.get("ai")?.map((w) => w.id)).toEqual(["y"]);
});

it("widthOf accepts a number or a function of the data", () => {
  expect(widthOf(def("a"), null)).toBe(1);
  const wide = defineWidget<number>({ id: "b", name: "b", description: "", category: "ai", Tile: () => null, width: (d) => (d ?? 0) + 2 });
  expect(widthOf(wide, 3)).toBe(5);
});
