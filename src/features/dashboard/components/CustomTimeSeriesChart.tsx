import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import DocPopup from "@/src/components/layouts/doc-popup";
import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import { NoData } from "@/src/features/dashboard/components/NoData";

type TimeSeriesDataPoint = [Date, number];

export const CustomTimeSeriesChart = ({
  className,
  projectId,
  chartConfig,
}: {
  className?: string;
  chartConfig: any;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const dataPoints = [[new Date("2023-01-01"), 1]] as TimeSeriesDataPoint[];

  return (
    <DashboardCard
      className={className}
      title={chartConfig.name}
      isLoading={false}
      cardContentClassName="flex flex-col content-end "
    >
      <BaseTimeSeriesChart
        className="h-full min-h-80 self-stretch"
        agg={agg}
        data={transformedTraces}
        connectNulls={true}
      />
    </DashboardCard>
  );
};
