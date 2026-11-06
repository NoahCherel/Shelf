import { beforeEach, vi } from "vitest";
import { invoke } from "./tauri";
import { addSpace, DEFAULT_LAYOUT, removeSaved, useLayout } from "./layout";

vi.mock("./tauri", () => ({ invoke: vi.fn(), listen: vi.fn(async () => () => {}) }));
vi.mock("./registry", () => ({
  widgets: ["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather", "clock", "battery"].map((id) => ({ id })),
}));

const mockInvoke = vi.mocked(invoke);
const saved = () => mockInvoke.mock.calls.filter((c) => c[0] === "store_save").map((c) => c[1]);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  useLayout.setState({ ids: ["apps", "clock"] });
});

describe("changes", () => {
  it("add appends last", () => {
    useLayout.getState().add("battery");
    expect(useLayout.getState().ids).toEqual(["apps", "clock", "battery"]);
  });

  it("add ignores duplicates", () => {
    useLayout.getState().add("clock");
    expect(useLayout.getState().ids).toEqual(["apps", "clock"]);
    expect(saved()).toEqual([]);
  });

  it("remove drops the id", () => {
    useLayout.getState().remove("apps");
    expect(useLayout.getState().ids).toEqual(["clock"]);
  });

  it("move reorders", () => {
    useLayout.setState({ ids: ["apps", "clock", "battery"] });
    useLayout.getState().move(0, 2);
    expect(useLayout.getState().ids).toEqual(["clock", "battery", "apps"]);
  });

  it("every change saves with a version", () => {
    useLayout.getState().add("battery");
    expect(saved()).toEqual([{ name: "layout", value: { version: 2, ids: ["apps", "clock", "battery"] } }]);
  });
});

describe("load", () => {
  it("drops ids not in the registry and keeps the rest", async () => {
    mockInvoke.mockResolvedValue({ version: 2, ids: ["clock", "gone-widget", "apps"] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(["clock", "apps"]);
  });

  it("drops duplicates and non-strings", async () => {
    mockInvoke.mockResolvedValue({ version: 2, ids: ["clock", "clock", 7, null] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(["clock"]);
  });

  it("yields the default layout when nothing is saved", async () => {
    mockInvoke.mockResolvedValue(null);
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(DEFAULT_LAYOUT);
    expect(DEFAULT_LAYOUT).toEqual(["claude-plan-usage", "apps", "github-activity", "system-status", "clock-and-weather"]);
  });

  it("yields the default layout for a corrupt shape", async () => {
    for (const bad of [{ ids: "nope" }, 7, "text", []]) {
      mockInvoke.mockResolvedValue(bad);
      useLayout.setState({ ids: [] });
      await useLayout.getState().load();
      expect(useLayout.getState().ids).toEqual(DEFAULT_LAYOUT);
    }
  });

  it("keeps a layout the owner emptied on purpose", async () => {
    mockInvoke.mockResolvedValue({ version: 2, ids: [] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual([]);
  });

  it("gives a layout saved before the status tile one, last", async () => {
    mockInvoke.mockResolvedValue({ version: 1, ids: ["apps", "clock"] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(["apps", "clock", "system-status"]);
  });

  it("doesn't bring it back once removed", async () => {
    mockInvoke.mockResolvedValue({ version: 2, ids: ["apps", "clock"] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(["apps", "clock"]);
  });

  it("does not write back while loading", async () => {
    mockInvoke.mockResolvedValue({ version: 2, ids: ["clock", "gone-widget"] });
    await useLayout.getState().load();
    expect(saved()).toEqual([]);
  });
});

describe("flexible spaces", () => {
  it("are kept from the saved layout, several of them, among the widgets", async () => {
    mockInvoke.mockResolvedValueOnce({ version: 2, ids: ["space:1", "apps", "space:2", "clock", "space:x", "spacebar"] });
    await useLayout.getState().load();
    expect(useLayout.getState().ids).toEqual(["space:1", "apps", "space:2", "clock"]);
  });

  it("a new one goes last, with a number of its own, on top of what's saved", async () => {
    useLayout.setState({ ids: [] });
    mockInvoke.mockResolvedValueOnce({ version: 2, ids: ["apps", "space:3", "clock"] });
    await addSpace();
    expect(useLayout.getState().ids).toEqual(["apps", "space:3", "clock", "space:4"]);
    expect(saved().at(-1)).toEqual({ name: "layout", value: { version: 2, ids: ["apps", "space:3", "clock", "space:4"] } });
  });

  it("removing one from another window starts from what's saved too", async () => {
    useLayout.setState({ ids: [] });
    mockInvoke.mockResolvedValueOnce({ version: 2, ids: ["apps", "space:1", "clock"] });
    await removeSaved("space:1");
    expect(saved().at(-1)).toEqual({ name: "layout", value: { version: 2, ids: ["apps", "clock"] } });
  });
});
