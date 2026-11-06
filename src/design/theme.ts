export type StyleName = "liquid" | "black";
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
