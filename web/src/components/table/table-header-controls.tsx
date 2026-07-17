import { TimeRangePicker } from "@/src/components/date-picker";
import {
  DataTableRefreshButton,
  type RefreshInterval,
} from "@/src/components/table/data-table-refresh-button";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import {
  TABLE_AGGREGATION_OPTIONS,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type RefreshControls = {
  onRefresh: () => void;
  isRefreshing: boolean;
  interval: RefreshInterval;
  setInterval: (interval: RefreshInterval) => void;
};

/**
 * Renders a table's time-range picker (and, optionally, an auto-refresh
 * button) into the page header's controls slot, next to the page title —
 * mirroring the Home dashboard layout. Single source of truth for the header
 * placement, preset set, and styling of these controls across all list tables.
 *
 * Use only when the table is the primary content of a `Page`; embedded tables
 * keep their controls in the toolbar and should not render this. Pass `refresh`
 * only for tables that already expose an auto-refresh control.
 */
export function TableHeaderControls({
  timeRange,
  setTimeRange,
  refresh,
}: {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
  refresh?: RefreshControls;
}) {
  return (
    <PageHeaderControlsPortal>
      <TimeRangePicker
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        timeRangePresets={TABLE_AGGREGATION_OPTIONS}
        className="my-0 max-w-full overflow-x-auto"
        triggerClassName="px-2"
      />
      {refresh && (
        <DataTableRefreshButton
          onRefresh={refresh.onRefresh}
          isRefreshing={refresh.isRefreshing}
          interval={refresh.interval}
          setInterval={refresh.setInterval}
        />
      )}
    </PageHeaderControlsPortal>
  );
}
