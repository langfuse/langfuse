// Search-bar row: the query composer at (near) full width. EventsTable owns the
// sticky stack around this row + the toolbar so the toolbar cannot scroll under
// the composer. Time-range + refresh controls normally live in the page header
// (portaled by EventsTable). When the host page provides no header slot,
// EventsTable passes them here as `inlineControls` so they always render
// somewhere. Left padding matches the toolbar row below so the bar's left edge
// aligns with it.

import type { ReactNode } from "react";

import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import type { SearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

export function EventsSearchBarRow({
  projectId,
  store,
  commit,
  observed,
  inlineControls,
}: {
  projectId: string;
  store: SearchBarStore;
  commit: () => boolean;
  observed: ObservedOptions | undefined;
  /** Time-range + refresh, rendered inline when the page provides no header
   * slot. Undefined when those controls are portaled into the page header. */
  inlineControls?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-2 pt-2 pb-1">
      <div className="min-w-0 flex-1">
        <SearchBarStoreProvider store={store} commit={commit}>
          <SearchComposer projectId={projectId} observed={observed} />
        </SearchBarStoreProvider>
      </div>
      {inlineControls}
    </div>
  );
}
