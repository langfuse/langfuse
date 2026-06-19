// Search-bar row: the query composer at full width, with an AI sub-mode.
// EventsTable owns the sticky stack around this row + the toolbar so the toolbar
// cannot scroll under the composer. Time-range + refresh controls live in the
// toolbar row below (next to the filter toggle and views), not here. Left
// padding matches the toolbar row below so the bar's left edge aligns with it.
//
// AI mode (Tab on an empty bar, or the "Ask AI" affordance) swaps the grammar
// composer for a natural-language prompt. The generated filters are applied
// through `setFilterState` — the SAME path the facet sidebar uses — so the
// composer re-derives them as editable pills when we switch back.

import * as React from "react";

import { type FilterState } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { SearchBarAiPrompt } from "@/src/features/search-bar/components/SearchBarAiPrompt";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import type { SearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

export function EventsSearchBarRow({
  projectId,
  store,
  commit,
  observed,
  setFilterState,
}: {
  projectId: string;
  store: SearchBarStore;
  commit: () => string | null;
  observed: ObservedOptions | undefined;
  /** Applies AI-generated filters (apply-immediately); the bar re-derives them. */
  setFilterState: (filters: FilterState) => void;
}) {
  const [aiMode, setAiMode] = React.useState(false);
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useQueryProject();
  // Mirror the legacy wand gate: Cloud + org-level AI features. The server
  // enforces it too, so this only governs whether the affordance is offered.
  const aiAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled);

  return (
    <div className="min-w-0 px-2 pt-2 pb-1">
      {aiMode && aiAvailable ? (
        <SearchBarAiPrompt
          projectId={projectId}
          onApply={setFilterState}
          onExit={() => setAiMode(false)}
        />
      ) : (
        <SearchBarStoreProvider store={store} commit={commit}>
          <SearchComposer
            projectId={projectId}
            observed={observed}
            onActivateAi={aiAvailable ? () => setAiMode(true) : undefined}
          />
        </SearchBarStoreProvider>
      )}
    </div>
  );
}
