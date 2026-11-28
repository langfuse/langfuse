import type { FilterState } from "@langfuse/shared";

export type ActiveTableFilterState = {
  tableName: string;
  filters: FilterState;
};

type Entry = { owner: symbol; state: ActiveTableFilterState };

// Filters a page-level table applies are not always in its URL: session-storage
// restores, default filters, and oversized states leave `?filter=` absent.
// Readers that describe the current screen (the in-app agent) read the applied
// state here instead of parsing the URL.
let entries: Entry[] = [];

/** Registers a mounted table's applied filters; returns the unregister call. */
export function publishActiveTableFilterState(
  state: ActiveTableFilterState,
): () => void {
  const owner = Symbol(state.tableName);
  entries = [...entries, { owner, state }];

  return () => {
    entries = entries.filter((entry) => entry.owner !== owner);
  };
}

/** The most recently published state of a still-mounted table. */
export function getActiveTableFilterState():
  | ActiveTableFilterState
  | undefined {
  return entries.at(-1)?.state;
}
