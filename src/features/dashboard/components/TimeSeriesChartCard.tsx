import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/base-charts/BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import {} from "@/src/features/dashboard/components/hooks";
import { type TimeSeriesChartDataPoint } from "./base-charts/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/DashboardCard";

interface TimeSeriesChartCardProps {
  title: string;
  className?: string;
  description?: string;
  metric: string;
  isLoading: boolean;
  data?: TimeSeriesChartDataPoint[];
  agg: DateTimeAggregationOption;
  connectNulls: boolean;
}

export const TimeSeriesChartCard = ({
  title,
  description,
  className,
  isLoading,
  data,
  agg,
  connectNulls,
}: TimeSeriesChartCardProps) => {
  return (
    <DashboardCard
      className={className}
      title={title}
      description={description}
      isLoading={isLoading}
    >
      <BaseTimeSeriesChart
        agg={agg}
        data={data ?? []}
        connectNulls={connectNulls}
      />
    </DashboardCard>
  );
};
