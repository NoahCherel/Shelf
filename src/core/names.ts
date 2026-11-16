/** What a card window can show, as the start of its id. Rust reads two of these: see shell/card.rs. */
export const CARD = {
  menu: "__menu:",
  appMenu: "__appmenu:",
  panel: "__panel:",
  group: "__group:",
  stack: "__stack:",
} as const;

/** Files in Shelf's storage. Rust reads these too: see store.rs. */
export const STORE = {
  layout: "layout",
  settings: "settings",
  startImage: "start-image",
  /** What the automations already warned about. */
  automations: "automations",
} as const;
