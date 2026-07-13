import { lazy, Suspense, useMemo } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  getDateFromOption,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type FilterState } from "@langfuse/shared";

const EventsTable = lazy(
  () => import("@/src/features/events/components/EventsTable"),
);

// The preview pins a minimal column set; the full events table shows the rest.
const PREVIEW_COLUMNS: Record<string, boolean> = {
  startTime: true,
  type: true,
  name: true,
  traceName: true,
  input: true,
  output: true,
  metadata: true,
};

/**
 * Read-only preview of observations matching the scope filter, embedded the
 * same way as the old evaluator configuration screen: the real events table
 * (hidden controls, last-24h sample, capped rows) in a bordered container.
 */
export function ScopePreviewTable({
  projectId,
  filterState,
  onSelectTrace,
}: {
  projectId: string;
  filterState: FilterState;
  /** Row click: use the clicked row's trace as the sample trace. */
  onSelectTrace?: (traceId: string, timestamp: Date | null) => void;
}) {
  const dateRange = useMemo(() => {
    return {
      from: getDateFromOption({
        filterSource: "TABLE",
        option: "last1Day",
      }),
    } as TableDateRange;
  }, []);

  return (
    <div className="flex max-h-[30dvh] w-full flex-col overflow-hidden border-r border-b border-l">
      <Suspense fallback={<Skeleton className="h-[30dvh] w-full" />}>
        <EventsTable
          projectId={projectId}
          hideControls
          externalFilterState={filterState}
          externalDateRange={dateRange}
          limitRows={10}
          externalColumnVisibility={PREVIEW_COLUMNS}
          onExternalRowClick={
            onSelectTrace
              ? (row) => {
                  if (row.traceId) {
                    onSelectTrace(row.traceId, row.timestamp ?? null);
                  }
                }
              : undefined
          }
        />
      </Suspense>
    </div>
  );
}
