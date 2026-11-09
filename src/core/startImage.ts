import { STORE } from "./names";
import { invoke } from "./tauri";

const SIDE = 128;
const MOST_CHARS = 500_000;

export function validStartImage(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") && value.length <= MOST_CHARS;
}

/** A square PNG of the picture's middle, small enough to keep. */
export async function shrinkImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  return canvas.toDataURL("image/png");
}

export function saveStartImage(data: string | null): Promise<unknown> {
  return invoke("store_save", { name: STORE.startImage, value: data ? { data } : {} });
}
