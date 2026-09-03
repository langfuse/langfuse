import { type RowData } from "@tanstack/react-table";

import {
  createTableColumn,
  type TableColumnOptions,
} from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
import { NotRecordedMetric } from "./NotRecordedMetric";

type ExperimentMetric = "cost" | "latency";

/**
 * A cost of exactly 0 means the run's calls reported no usage or pricing, which
 * reads as free rather than as missing. A latency of 0 is a real measurement.
 */
const isRecorded = (
  metric: ExperimentMetric,
  value: number | null | undefined,
): value is number =>
  value !== null && value !== undefined && (metric !== "cost" || value !== 0);

/**
 * A cost or latency column for an experiments table. The metrics load in a
 * second query that resolves after the rows, so the cell has three states: the
 * skeleton while that query is in flight, `NotRecordedMetric` once it lands
 * without a value, and the formatted number otherwise.
 */
export function createExperimentMetricColumn<TData extends RowData>({
  formatter,
  metric,
  metricsLoading,
  ...options
}: TableColumnOptions<TData, number> & {
  formatter: (value: number) => string;
  metric: ExperimentMetric;
  metricsLoading: boolean;
}) {
  const loadingCell = <Skeleton className="h-4 w-1/2" />;

  return createTableColumn<TData, number>({
    ...options,
    loadingCell,
    renderCell: (value) => {
      // Rows render before their metrics, so without this the cell would first
      // claim the metric was not recorded and then correct itself.
      if (metricsLoading) return loadingCell;

      if (!isRecorded(metric, value))
        return <NotRecordedMetric metric={metric} />;

      return <span>{formatter(value)}</span>;
    },
  });
}
