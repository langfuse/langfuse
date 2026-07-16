import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { SearchX } from "lucide-react";

import { Skeleton } from "@/src/components/ui/skeleton";
import useLocalStorage from "@/src/components/useLocalStorage";
import { type EventsTableRow } from "@/src/features/events/components/EventsTable";
import { scopeTimeRangeFilter } from "@/src/features/evals/v2/lib/useScopeMatchCount";
import { cn } from "@/src/utils/tailwind";
import {
  type AbsoluteTimeRange,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type FilterState } from "@langfuse/shared";

const EventsTable = lazy(
  () => import("@/src/features/events/components/EventsTable"),
);

// The preview's default column set; users add more via the picker.
const PREVIEW_DEFAULT_COLUMNS: Record<string, boolean> = {
  startTime: true,
  type: true,
  name: true,
  traceName: true,
  input: true,
  output: true,
};

/**
 * Read-only preview of observations matching the scope filter, embedded the
 * same way as the old evaluator configuration screen: the real events table
 * (hidden controls, infinite scroll) in a bordered container. The rows
 * sample the view's global time range.
 */
export function ScopePreviewTable({
  projectId,
  filterState,
  timeRange,
  onSelectObservation,
  onPickObservation,
  selectedObservationId,
  onRowsChange,
  columnsPickerContainer,
}: {
  projectId: string;
  filterState: FilterState;
  /** Absolute range from the global time filter; null = unbounded. */
  timeRange: AbsoluteTimeRange | null;
  /** Row click: use the clicked observation as the sample. */
  onSelectObservation?: (row: EventsTableRow) => void;
  /** Radio-dot pick: use the row as the sample without row-click side
      effects (e.g. opening the peek). */
  onPickObservation?: (row: EventsTableRow) => void;
  /** The picked sample row — drives the radio-dot column and row highlight.
      Pass null (not undefined) to show the picker with nothing picked. */
  selectedObservationId?: string | null;
  /** Reports the loaded preview rows, e.g. to derive sample candidates. */
  onRowsChange?: (rows: EventsTableRow[]) => void;
  /** Where to render the columns picker (e.g. next to the section label). */
  columnsPickerContainer?: HTMLElement | null;
}) {
  // EventsTable ignores externalDateRange for the rows query when an external
  // filter state is set, so the time bound goes into the filter itself;
  // externalDateRange still scopes the facet options.
  const effectiveFilterState = useMemo(
    () => filterState.concat(scopeTimeRangeFilter(timeRange)),
    [filterState, timeRange],
  );
  const dateRange: TableDateRange | undefined = timeRange ?? undefined;

  const [columnVisibility, setColumnVisibility] = useLocalStorage<
    Record<string, boolean>
  >(
    // v2: input/output joined the default set — a fresh key so stored
    // pre-change visibility doesn't mask the new defaults.
    `evalScopePreviewColumns-v2-${projectId}`,
    PREVIEW_DEFAULT_COLUMNS,
  );

  // Zero matches: swap the visible table for a call to action. The table
  // stays mounted (hidden) so its query refetches on filter/range changes
  // and reports rows back the moment something matches again.
  const [isEmpty, setIsEmpty] = useState(false);
  const handleRowsChange = useCallback(
    (rows: EventsTableRow[]) => {
      setIsEmpty(rows.length === 0);
      onRowsChange?.(rows);
    },
    [onRowsChange],
  );

  return (
    <>
      {isEmpty && (
        <div className="text-muted-foreground flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-8 text-center text-sm">
          <SearchX className="h-4 w-4" />
          <p className="text-foreground font-medium">
            No observations match the current filters and time range
          </p>
          <p>
            Try adjusting the filters or extending the time range in the page
            header.
          </p>
        </div>
      )}
      {/* Exactly six fully visible rows: 40px header + 6 × 29px rows (h-7
          plus the 1px separator) + 3px of borders — more rows load in on
          scroll. */}
      <div
        className={cn(
          "flex max-h-[217px] w-full flex-col overflow-hidden border",
          isEmpty && "hidden",
        )}
      >
        <Suspense fallback={<Skeleton className="h-[217px] w-full" />}>
          <EventsTable
            projectId={projectId}
            hideControls
            externalFilterState={effectiveFilterState}
            externalDateRange={dateRange}
            embeddedPageSize={10}
            embeddedInfiniteScroll
            externalColumnVisibility={columnVisibility}
            onExternalColumnVisibilityChange={setColumnVisibility}
            columnsPickerContainer={columnsPickerContainer}
            onExternalRowClick={onSelectObservation}
            externalSelectedRowId={selectedObservationId}
            onExternalRowPick={onPickObservation}
            onExternalRowsChange={handleRowsChange}
          />
        </Suspense>
      </div>
    </>
  );
}
