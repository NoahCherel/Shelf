import { expect, it } from "vitest";
import { usesGlass } from "./theme";

it("gives up the glass to show in captures, as the glass needs the dock left out of them", () => {
  expect(usesGlass("liquid", "frosted", false)).toBe(true);
  expect(usesGlass("liquid", "frosted", true)).toBe(false);
  expect(usesGlass("ios", "frosted", true)).toBe(false);
  expect(usesGlass("clear", "frosted", true)).toBe(false);
  expect(usesGlass("black", "frosted", false)).toBe(false);
});
