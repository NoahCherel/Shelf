/**
 * How far to shift sampling at a point: nothing in the middle, most at the rim, like a thin lens.
 * `distance` is negative inside the shape and 0 on its edge. refract.frag uses the same curve.
 */
export function lensOffset(distance: number, band: number, strength: number): number {
  const k = Math.min(1, Math.max(0, 1 + distance / band));
  return k * k * k * strength;
}
