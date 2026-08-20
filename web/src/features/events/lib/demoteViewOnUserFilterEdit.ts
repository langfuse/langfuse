import isEqual from "lodash/isEqual";
import { type FilterState } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
import { isSystemPresetId } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";

export type ViewDemotionControllers = {
  selectedViewId: string | null;
  handleSetViewId: (
    viewId: string | null,
    options?: { updateType?: UrlUpdateType },
  ) => void;
};

export type ExplicitFilterStateChange = {
  previousFilters: FilterState;
  nextFilters: FilterState;
  origin: "user" | "saved_view" | "system";
};

/**
 * A user-origin filter edit diverges the table from an active SYSTEM preset,
 * so demote it — otherwise the session-storage restore resurrects the
 * just-edited filters on the next clean-URL mount, with the chip staying lit
 * (LFE-14699). System presets are code-defined with no "Update view" flow, so
 * a full deselect is safe (chip unlights, URL + session storage cleared,
 * `replaceIn` so Back does not bounce, LFE-10715).
 *
 * The decision keys off `selectedViewId` (the URL `?viewId`) ONLY — never the
 * sessionStorage-backed `appliedViewId`. The stored id is deliberately not
 * synced when a link with explicit table state is opened
 * (hasExplicitTableStateInUrl), so it can go stale: chip applied earlier in
 * the tab → user opens a saved view's permalink → stored id still names the
 * preset while the URL names the user view. Keying off the stale stored id
 * would strip the user view's `?viewId` on the next edit. Every intended
 * demotion path (chip apply, session restore) sets the URL param, so the URL
 * is both sufficient and authoritative.
 *
 * Deliberately scoped to system presets: USER-SAVED views keep today's
 * behavior wholesale. Demoting one by dropping only its session restore
 * degrades "Update view" — `appliedViewId === selectedViewId` is the
 * load-bearing column-trust signal (LFE-10486), and breaking it silently
 * reverts live column edits to the view's stored snapshot on the next update.
 * Extending demotion to user-saved views first needs the session-restore
 * signal decoupled from the column-trust signal.
 */
export function demoteViewOnUserFilterEdit(
  change: ExplicitFilterStateChange,
  controllers: ViewDemotionControllers | null,
): void {
  if (change.origin !== "user") return;
  // A no-op write (e.g. re-committing unchanged search-bar text) is not a
  // divergence. Relies on every system preset's filters surviving the
  // search-bar grammar round-trip deep-equal — guarded by
  // systemPresetSearchBarRoundTrip.clienttest.ts.
  if (isEqual(change.previousFilters, change.nextFilters)) return;
  if (!controllers) return;
  if (!isSystemPresetId(controllers.selectedViewId)) return;
  controllers.handleSetViewId(null, { updateType: "replaceIn" });
}
