import { api } from "@/src/utils/api";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import DocPopup from "@/src/components/layouts/doc-popup";
import { isEmptyTimeSeries } from "@/src/features/dashboard/components/hooks";
import { NoData } from "@/src/features/dashboard/components/NoData";

export const FeatureUsageTimeSeriesChart = ({
  className,
  projectId,
  globalFilterState,
  agg,
}: {
  className?: string;
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const featureUsageTimeSeries =
    api.keyAnalytics.featureUsageTimeSeries.useQuery(
      {
        projectId,
        agg,
      },
      {
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  const transformedFeatureUsage = featureUsageTimeSeries.data
    ? featureUsageTimeSeries.data.map((item) => {
        return {
          ts: item.timestamp.getTime(),
          values: [
            {
              label: item.featureName,
              value: Number(item.count),
            },
          ],
        };
      })
    : [];

  return (
    <DashboardCard
      className={className}
      title="Feature Usage"
      isLoading={featureUsageTimeSeries.isLoading}
      cardContentClassName="flex flex-col content-end"
    >
      {!isEmptyTimeSeries(transformedFeatureUsage) ? (
        <BaseTimeSeriesChart
          className="h-full min-h-80 self-stretch"
          agg={agg}
          data={transformedFeatureUsage ?? []}
          showLegend={true}
        />
      ) : (
        <NoData noDataText="No feature usage data available">
          <DocPopup
            description="Feature usage data shows the usage of features based on the trace name over time."
            href="https://example.com/docs/feature-usage"
          />
        </NoData>
      )}
    </DashboardCard>
  );
};
