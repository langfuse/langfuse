// Search-bar row: the query composer at full width. EventsTable owns the
// sticky stack around this row + the toolbar so the toolbar cannot scroll under
// the composer. Time-range + refresh controls live in the toolbar row below
// (next to the filter toggle and views), not here. Left padding matches the
// toolbar row below so the bar's left edge aligns with it.

import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import type { SearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

export function EventsSearchBarRow({
  projectId,
  store,
  commit,
  observed,
}: {
  projectId: string;
  store: SearchBarStore;
  commit: () => boolean;
  observed: ObservedOptions | undefined;
}) {
  return (
    <div className="min-w-0 px-2 pt-2 pb-1">
      <SearchBarStoreProvider store={store} commit={commit}>
        <SearchComposer projectId={projectId} observed={observed} />
      </SearchBarStoreProvider>
    </div>
  );
}
