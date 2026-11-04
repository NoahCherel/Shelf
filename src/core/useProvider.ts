import { useCallback, useSyncExternalStore } from "react";
import { refresh as refreshProvider, snapshot, subscribe, type Snapshot } from "./provider";
import type { Provider } from "./widget";

const noSubscribe = () => () => {};

export function useProvider<D>(p: Provider<D> | undefined, sample?: D): Snapshot<D> & { refresh(): void } {
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => (p ? subscribe(p, sample, listener) : noSubscribe()), [p, sample]),
    () => (p ? snapshot(p, sample) : sampleState<D>(sample)),
  );
  const refresh = useCallback(() => {
    if (p) refreshProvider(p);
  }, [p]);
  return { ...state, refresh };
}

// Must be the same object every time, or React re-renders forever.
const samples = new Map<unknown, Snapshot<any>>();
function sampleState<D>(sample?: D): Snapshot<D> {
  let state = samples.get(sample);
  if (!state) {
    state = { data: sample ?? null, status: "sample" };
    samples.set(sample, state);
  }
  return state;
}
