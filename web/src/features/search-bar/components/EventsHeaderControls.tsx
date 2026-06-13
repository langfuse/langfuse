// Time-range picker + refresh control, rendered into the page header (next to
// the "Tracing" title) when the search bar is active — the search bar itself
// takes the full width of its own row below.

import { TimeRangePicker } from "@/src/components/date-picker";
import {
  DataTableRefreshButton,
  type RefreshInterval,
} from "@/src/components/table/data-table-refresh-button";
import {
  TABLE_AGGREGATION_OPTIONS,
  type TimeRange,
} from "@/src/utils/date-range-utils";

export function EventsHeaderControls({
  timeRange,
  setTimeRange,
  refreshConfig,
}: {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
  refreshConfig?: {
    onRefresh: () => void;
    isRefreshing: boolean;
    interval: RefreshInterval;
    setInterval: (interval: RefreshInterval) => void;
  };
}) {
  return (
    <>
      <TimeRangePicker
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        timeRangePresets={TABLE_AGGREGATION_OPTIONS}
        className="my-0 max-w-full overflow-x-auto"
      />
      {refreshConfig && (
        <DataTableRefreshButton
          onRefresh={refreshConfig.onRefresh}
          isRefreshing={refreshConfig.isRefreshing}
          interval={refreshConfig.interval}
          setInterval={refreshConfig.setInterval}
        />
      )}
    </>
  );
}
