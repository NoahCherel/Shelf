import { arrange, fractionAt } from "./arrange";

const W = 1000;
const GAP = 4;

it("with nothing placed yet, the widgets sit together in the middle, as before", () => {
  const at = arrange([{ id: "a", width: 100 }, { id: "b", width: 200 }], W, GAP);
  expect(at).toEqual({ a: 348, b: 452 });
});

it("a placed widget stays exactly where it was put", () => {
  const at = arrange([{ id: "a", width: 100, at: 0 }, { id: "b", width: 200, at: 0.5 }, { id: "c", width: 100, at: 1 }], W, GAP);
  expect(at).toEqual({ a: 0, b: 400, c: 900 });
});

it("one dropped on another pushes it just enough, keeping their order", () => {
  const at = arrange([{ id: "a", width: 100, at: 0.5 }, { id: "b", width: 100, at: 0.52 }], W, GAP);
  expect(at.a).toBe(450);
  expect(at.b).toBe(554);
});

it("near the right end, the push goes the other way rather than off the screen", () => {
  const at = arrange([{ id: "a", width: 100, at: 0.99 }, { id: "b", width: 100, at: 1 }], W, GAP);
  expect(at).toEqual({ a: 796, b: 900 });
});

it("a widget that grows pushes its neighbour, which goes back once there's room", () => {
  const wide = arrange([{ id: "apps", width: 500, at: 0 }, { id: "clock", width: 100, at: 0.4 }], W, GAP);
  expect(wide.clock).toBe(504);
  const narrow = arrange([{ id: "apps", width: 200, at: 0 }, { id: "clock", width: 100, at: 0.4 }], W, GAP);
  expect(narrow.clock).toBe(360);
});

it("a new widget goes just after the one before it", () => {
  const at = arrange([{ id: "a", width: 100, at: 0 }, { id: "new", width: 50 }, { id: "c", width: 100, at: 1 }], W, GAP);
  expect(at.new).toBe(104);
});

it("too many to fit start at the left and run on, never piling up", () => {
  const at = arrange([{ id: "a", width: 600, at: 0.5 }, { id: "b", width: 600, at: 0.5 }], W, GAP);
  expect(at).toEqual({ a: 0, b: 604 });
});

it("a position is the share of the room the widget could move along", () => {
  expect(fractionAt(0, 100, W)).toBe(0);
  expect(fractionAt(900, 100, W)).toBe(1);
  expect(fractionAt(450, 100, W)).toBe(0.5);
  expect(fractionAt(-50, 100, W)).toBe(0);
  expect(fractionAt(5000, 100, W)).toBe(1);
  expect(fractionAt(10, 1000, W)).toBe(0);
});
