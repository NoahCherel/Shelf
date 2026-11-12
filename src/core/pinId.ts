/** The id of a widget that opens an app or a folder of the owner's. */
const PREFIX = "pin:";

export type Pinned = { kind: "app" | "folder"; target: string };

/** A widget's id says what it opens. Forward slashes, as a backslash breaks the selectors ids go in. */
export function pinId(kind: Pinned["kind"], target: string): string {
  return `${PREFIX}${kind}:${target.replace(/\\/g, "/")}`;
}

export function parsePin(id: string): Pinned | null {
  const found = /^pin:(app|folder):(.+)$/.exec(id);
  return found ? { kind: found[1] as Pinned["kind"], target: found[2] } : null;
}

export function isPinId(id: string): boolean {
  return parsePin(id) !== null;
}

