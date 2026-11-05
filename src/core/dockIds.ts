import { create } from "zustand";

/** What's on the dock, for tiles that adapt to their neighbours. Apart from the layout, which imports every widget. */
export const useDockIds = create<{ ids: string[] }>(() => ({ ids: [] }));

export function setDockIds(ids: string[]): void {
  useDockIds.setState({ ids });
}
