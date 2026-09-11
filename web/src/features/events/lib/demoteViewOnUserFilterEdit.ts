import { type FilterState } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";

export type ViewDemotionControllers = {
  selectedViewId: string | null;
  handleSetViewId: (
    viewId: string | null,
    options?: { updateType?: UrlUpdateType },
  ) => void;
  handleUserStateChange: (
    previousValue: unknown,
    nextValue: unknown,
    options?: { force?: boolean },
  ) => void;
};

export type ExplicitFilterStateChange = {
  previousFilters: FilterState;
  nextFilters: FilterState;
  origin: "user" | "saved_view" | "system";
  action?: "clear";
};

/** User edits leave the selected view; view application and reconciliation do not. */
export function demoteViewOnUserFilterEdit(
  change: ExplicitFilterStateChange,
  controllers: ViewDemotionControllers | null,
): void {
  if (change.origin !== "user") return;
  controllers?.handleUserStateChange(
    change.previousFilters,
    change.nextFilters,
    { force: change.action === "clear" },
  );
}
