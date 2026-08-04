import isEqual from "lodash/isEqual";
import { type FilterState } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
import { isSystemPresetId } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";

export type ViewDemotionControllers = {
  selectedViewId: string | null;
  appliedViewId: string | null;
  handleSetViewId: (
    viewId: string | null,
    options?: { updateType?: UrlUpdateType },
  ) => void;
  clearStoredViewId: () => void;
};

export type ExplicitFilterStateChange = {
  previousFilters: FilterState;
  nextFilters: FilterState;
  origin: "user" | "saved_view" | "system";
};

/**
 * A user-origin filter edit diverges the table from the active saved view /
 * preset, so demote the view — otherwise the session-storage restore
 * resurrects the just-edited filters on the next clean-URL mount (LFE-14699).
 *
 * System presets are code-defined with no "Update view" flow → deselect fully
 * (chip unlights, URL + session storage cleared, `replaceIn` so Back does not
 * bounce, LFE-10715). User-saved views keep `?viewId` in the URL as provenance
 * for the drawer's "Update view" flow and only drop the session restore.
 */
export function demoteViewOnUserFilterEdit(
  change: ExplicitFilterStateChange,
  controllers: ViewDemotionControllers | null,
): void {
  if (change.origin !== "user") return;
  // A no-op write (e.g. re-committing unchanged search-bar text) is not a
  // divergence.
  if (isEqual(change.previousFilters, change.nextFilters)) return;
  if (!controllers) return;
  const activeViewId = controllers.appliedViewId ?? controllers.selectedViewId;
  if (!activeViewId) return;
  if (isSystemPresetId(activeViewId)) {
    controllers.handleSetViewId(null, { updateType: "replaceIn" });
  } else {
    controllers.clearStoredViewId();
  }
}
