/** Where each widget sits along a full-width dock. Pure, so it's testable. */

export interface Item {
  id: string;
  width: number;
  /** Where it was put: 0 against the left end, 1 against the right. Missing for one never moved. */
  at?: number;
}

/**
 * Left edges in px. Each widget stays where it was put, and neighbours move only as much as they
 * must not to overlap, so a widget that shrinks lets them go back. With nothing placed, the widgets
 * sit together in the middle. One never moved goes just after the one before it.
 */
export function arrange(items: Item[], width: number, gap: number): Record<string, number> {
  if (!items.some((item) => item.at !== undefined)) {
    const total = items.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, items.length - 1);
    let x = (width - total) / 2;
    return Object.fromEntries(
      items.map((item) => {
        const left = x;
        x += item.width + gap;
        return [item.id, left];
      }),
    );
  }

  let previousRight = -gap;
  const wanted = items.map((item, order) => {
    const left = item.at !== undefined ? item.at * Math.max(0, width - item.width) : previousRight + gap;
    previousRight = left + item.width;
    return { ...item, left, order };
  });
  wanted.sort((a, b) => a.left - b.left || a.order - b.order);

  // Pushed right past whatever overlaps, then back from the right end, then never past the left one.
  for (let i = 0; i < wanted.length; i++) {
    const floor = i === 0 ? 0 : wanted[i - 1].left + wanted[i - 1].width + gap;
    wanted[i].left = Math.max(wanted[i].left, floor);
  }
  for (let i = wanted.length - 1; i >= 0; i--) {
    const ceiling = i === wanted.length - 1 ? width - wanted[i].width : wanted[i + 1].left - gap - wanted[i].width;
    wanted[i].left = Math.min(wanted[i].left, ceiling);
  }
  for (let i = 0; i < wanted.length; i++) {
    const floor = i === 0 ? 0 : wanted[i - 1].left + wanted[i - 1].width + gap;
    wanted[i].left = Math.max(wanted[i].left, floor);
  }
  return Object.fromEntries(wanted.map((item) => [item.id, item.left]));
}

/** The position to save for a widget whose left edge is at \`left\`. */
export function fractionAt(left: number, itemWidth: number, width: number): number {
  const room = width - itemWidth;
  if (room <= 0) return 0;
  return Math.min(1, Math.max(0, left / room));
}
