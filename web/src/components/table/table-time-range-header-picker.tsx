import { TimeRangePicker } from "@/src/components/date-picker";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { TABLE_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";

/** Page-header date/time picker for table pages (traces, sessions, scores, …).
 *  Backed by the same shared per-project time-range state the tables read
 *  internally (useTableDateRange), so it can live in the page header — like
 *  Home — while the table below stays in sync. Pages using it should pass
 *  `hideTimeRangePicker` to their table to avoid a duplicate toolbar picker. */
export function TableTimeRangeHeaderPicker({
  projectId,
}: {
  projectId: string;
}) {
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  return (
    <TimeRangePicker
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      timeRangePresets={TABLE_AGGREGATION_OPTIONS}
      className="my-0 max-w-full overflow-x-auto"
    />
  );
}
