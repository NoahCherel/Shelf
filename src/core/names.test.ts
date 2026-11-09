import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CARD, STORE } from "./names";

const rust = (file: string) => readFileSync(`src-tauri/src/${file}`, "utf8");

it("Rust and the pages agree on which cards are menus", () => {
  const code = rust("shell/card.rs");
  expect(code).toContain(`MENU_PREFIX: &str = "${CARD.menu}"`);
  expect(code).toContain(`APP_MENU_PREFIX: &str = "${CARD.appMenu}"`);
});

it("Rust and the pages agree on the names of the saved files", () => {
  const code = rust("store.rs");
  expect(code).toContain(`LAYOUT: &str = "${STORE.layout}"`);
  expect(code).toContain(`SETTINGS: &str = "${STORE.settings}"`);
});
