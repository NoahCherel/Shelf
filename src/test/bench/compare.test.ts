import { PNG } from "pngjs";
import { changedPixels, passes } from "./compare.mjs";

function image(width: number, height: number, paint?: (x: number, y: number) => boolean): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const on = paint?.(x, y) ?? false;
      png.data[i] = on ? 255 : 20;
      png.data[i + 1] = on ? 40 : 20;
      png.data[i + 2] = 20;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

it("identical images have 0 changed pixels", () => {
  expect(changedPixels(image(40, 40), image(40, 40))).toBe(0);
});

it("one changed block of 100 pixels fails the check", () => {
  const changed = changedPixels(image(40, 40), image(40, 40, (x, y) => x > 10 && x <= 20 && y > 10 && y <= 20));
  expect(changed).toBeGreaterThan(50);
  expect(passes(changed)).toBe(false);
});

it("a few stray pixels pass", () => {
  expect(passes(50)).toBe(true);
  expect(passes(51)).toBe(false);
});

it("images of different sizes count as fully different", () => {
  expect(changedPixels(image(40, 40), image(30, 40))).toBe(1600);
});
