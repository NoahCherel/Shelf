// Compares two PNGs. Rendering noise along edges is ignored by pixelmatch's anti-aliasing check.
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** A count, not a percentage: the dock is a small share of a frame, so a share would hide real changes. */
const ALLOWED_CHANGED_PIXELS = 50;

/** Images of different sizes count as fully different. */
export function changedPixels(a, b, diffOut) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height) {
    return Math.max(left.width * left.height, right.width * right.height);
  }
  const diff = diffOut ? new PNG({ width: left.width, height: left.height }) : null;
  const changed = pixelmatch(left.data, right.data, diff?.data, left.width, left.height, { threshold: 0.1 });
  if (diff) diffOut(PNG.sync.write(diff));
  return changed;
}

export function passes(changed) {
  return changed <= ALLOWED_CHANGED_PIXELS;
}
