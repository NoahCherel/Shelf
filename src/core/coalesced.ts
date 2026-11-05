const EVERY_MS = 40;

/** Sends the first value at once, then at most one per interval, always ending on the last. */
export function coalesced<T>(send: (value: T) => void, everyMs = EVERY_MS): (value: T) => void {
  let waiting: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    timer = null;
    if (waiting) {
      send(waiting.value);
      waiting = null;
      timer = setTimeout(tick, everyMs);
    }
  };
  return (value) => {
    if (timer) {
      waiting = { value };
      return;
    }
    send(value);
    timer = setTimeout(tick, everyMs);
  };
}
