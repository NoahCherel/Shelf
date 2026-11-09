export type StyleName = "liquid" | "ios" | "midnight" | "black" | "white" | "clear";
export const STYLES: readonly StyleName[] = ["liquid", "ios", "midnight", "black", "white", "clear"];
export type ClearMaterial = "black" | "white" | "frosted";

/** The styles drawn from a capture of the screen behind the dock. */
export function usesGlass(style: StyleName, clearMaterial: ClearMaterial, visibleInCaptures: boolean): boolean {
  // The glass films the screen behind the dock, so Windows has to leave the dock out of every capture.
  if (visibleInCaptures) return false;
  return style === "liquid" || style === "ios" || (style === "clear" && clearMaterial === "frosted");
}
export type ThemeName = "dark" | "light";

const root = () => document.documentElement;

export function setStyle(name: StyleName): void {
  root().dataset.style = name;
}

export function setTheme(name: ThemeName): void {
  root().dataset.theme = name;
}

export function setDockSize(t: number): void {
  root().style.setProperty("--T", `${t}px`);
}

export function setAccent(color: string | null): void {
  if (color) root().style.setProperty("--accent", color);
  else root().style.removeProperty("--accent");
}

export function setEdge(edge: "bottom" | "top"): void {
  root().dataset.edge = edge;
}

export function setSpacing(hundredths: number): void {
  root().style.setProperty("--gap", `calc(var(--T) * ${hundredths / 100})`);
}

export function setClearMaterial(material: ClearMaterial): void {
  root().dataset.clear = material;
}
