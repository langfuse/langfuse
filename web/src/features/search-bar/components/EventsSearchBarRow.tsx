// Search-bar row: the query composer at full width, with an AI sub-mode.
// EventsTable owns the sticky stack around this row + the toolbar so the toolbar
// cannot scroll under the composer. Time-range + refresh controls live in the
// toolbar row below (next to the filter toggle and views), not here. Left
// padding matches the toolbar row below so the bar's left edge aligns with it.
//
// AI mode (the "Ask AI" affordance) swaps the grammar composer for a
// natural-language prompt. The generated filters are applied
// through `setFilterState` — the SAME path the facet sidebar uses — so the
// composer re-derives them as editable pills when we switch back. When opened
// with filters present, the bar's live draft is the refine context, so the
// model updates the existing filters instead of starting from scratch — read
// live from the store (not snapshotted), since the sidebar can change the
// filters while AI mode is open.

import * as React from "react";

import { type FilterState } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { AI_GROUNDING_COLUMNS } from "@/src/features/search-bar/lib/ai-context";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { SearchBarAiPrompt } from "@/src/features/search-bar/components/SearchBarAiPrompt";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import type { SearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

export function EventsSearchBarRow({
  projectId,
  store,
  commit,
  observed,
  erroredColumns,
  onApplyFilters,
  onRequestColumns,
  aiDataContext,
}: {
  projectId: string;
  store: SearchBarStore;
  commit: () => string | null;
  observed: ObservedOptions | undefined;
  /** Columns whose lazy fetch terminally errored — value-stage loading settles to
   *  empty (per column) instead of pinning, matching the sidebar's settled-error
   *  state, without blocking other columns. */
  erroredColumns?: ReadonlySet<string>;
  /**
   * Applies AI-generated filters (apply-immediately); the bar re-derives them.
   * Preserves filters the grammar can't represent (no-silent-drop contract) —
   * comes from `useEventsSearchBar.applyFilters`, not a raw `setFilterState`.
   */
  onApplyFilters: (filters: FilterState) => void;
  /**
   * Lazy filter-options: widen the requested column set on demand. Threaded to
   * the composer (request a field's values when typed) and fired on Ask AI open
   * (request the grounding columns so the prompt sees real values).
   */
  onRequestColumns?: (columns: readonly string[]) => void;
  /** Project data context (observed values + metadata keys + result count) for
   *  the AI prompt — built by EventsTable from filterOptions + visible rows. */
  aiDataContext?: string;
}) {
  const [aiOpen, setAiOpen] = React.useState(false);
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useQueryProject();
  // Mirror the legacy wand gate: Cloud + org-level AI features. The server
  // enforces it too, so this only governs whether the affordance is offered.
  const aiAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled);

  const activateAi = React.useCallback(() => {
    // Ground the model on real project values: lazily request the AI columns so
    // they are loaded by the time the user submits a prompt.
    onRequestColumns?.(AI_GROUNDING_COLUMNS);
    setAiOpen(true);
  }, [onRequestColumns]);

  return (
    <div className="min-w-0 px-2 pt-2 pb-1">
      {aiOpen && aiAvailable ? (
        <SearchBarAiPrompt
          projectId={projectId}
          store={store}
          dataContext={aiDataContext}
          onApply={onApplyFilters}
          onExit={() => setAiOpen(false)}
        />
      ) : (
        <SearchBarStoreProvider store={store} commit={commit}>
          <SearchComposer
            projectId={projectId}
            observed={observed}
            erroredColumns={erroredColumns}
            onActivateAi={aiAvailable ? activateAi : undefined}
            onRequestColumns={onRequestColumns}
          />
        </SearchBarStoreProvider>
      )}
    </div>
  );
}
