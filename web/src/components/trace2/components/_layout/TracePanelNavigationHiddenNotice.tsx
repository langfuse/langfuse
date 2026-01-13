/**
 * HiddenObservationsNotice - Shows notification when observations are filtered by minimum level
 *
 * Displays:
 * - Count of hidden observations
 * - Current minimum observation level
 * - "Show all" link to reset filter to DEBUG level
 *
 * Only renders when hiddenObservationsCount > 0
 * Fixed height component placed below NavigationHeader
 */

import { ObservationLevel } from "@langfuse/shared";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";

export function TracePanelNavigationHiddenNotice() {
  const { hiddenObservationsCount } = useTraceData();
  const { minObservationLevel, setMinObservationLevel } = useViewPreferences();

  const handleShowAll = () => {
    setMinObservationLevel(ObservationLevel.DEBUG);
  };

  // Only show when observations are hidden
  if (hiddenObservationsCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-shrink-0 items-center justify-end gap-1 border-b px-4 py-1">
      <span className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row">
        <p>
          {hiddenObservationsCount} hidden observations below{" "}
          {minObservationLevel} level.
        </p>
        <p
          className="cursor-pointer underline"
          onClick={handleShowAll}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleShowAll();
            }
          }}
        >
          Show all
        </p>
      </span>
    </div>
  );
}
