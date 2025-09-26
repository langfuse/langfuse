import React, { useMemo } from "react";
import { api } from "@/src/utils/api";
import { BigNumber } from "@/src/features/widgets/chart-library/BigNumber";
import { type FilterState } from "@langfuse/shared";
import { mapLegacyUiTableFilterToView } from "@/src/features/query";
import { type z } from "zod";
import { views, metricAggregations } from "@/src/features/query";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { 
  dashboardDateRangeAggregationSettings,
  type DashboardDateRangeAggregationOption 
} from "@/src/utils/date-range-utils";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

interface DistinctUserCountWidgetProps {
  projectId: string;
  globalFilterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  agg: DashboardDateRangeAggregationOption;
  className?: string;
  isLoading?: boolean;
}

export function DistinctUserCountWidget({
  projectId,
  globalFilterState,
  fromTimestamp,
  toTimestamp,
  agg,
  className,
  isLoading = false,
}: DistinctUserCountWidgetProps) {
  // Query for total distinct users count
  const totalCountQuery = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: {
        view: "traces" as z.infer<typeof views>,
        dimensions: [],
        metrics: [
          {
            measure: "distinctUsers",
            aggregation: "count" as z.infer<typeof metricAggregations>,
          },
        ],
        filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
        timeDimension: null,
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
        orderBy: null,
        chartConfig: {
          type: "NUMBER",
        },
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  // Query for time series data of distinct users
  const timeSeriesQuery = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: {
        view: "traces" as z.infer<typeof views>,
        dimensions: [],
        metrics: [
          {
            measure: "distinctUsers",
            aggregation: "count" as z.infer<typeof metricAggregations>,
          },
        ],
        filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
        timeDimension: {
          granularity: dashboardDateRangeAggregationSettings[agg].date_trunc,
        },
        fromTimestamp: fromTimestamp.toISOString(),
        toTimestamp: toTimestamp.toISOString(),
        orderBy: null,
      },
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !isLoading,
    },
  );

  const totalUserCount = totalCountQuery.data?.[0]?.count_distinctUsers || 0;

  const timeSeriesData = useMemo(() => {
    return timeSeriesQuery.data
      ? timeSeriesQuery.data.map((item) => {
          return {
            ts: new Date(item.time_dimension as any).getTime(),
            values: [
              {
                label: "Distinct Users",
                value: Number(item.count_distinctUsers),
              },
            ],
          };
        })
      : [];
  }, [timeSeriesQuery.data]);

  const hasData = timeSeriesData.length > 0;

  return (
    <DashboardCard
      className={className}
      title="Distinct Users"
      isLoading={isLoading || totalCountQuery.isLoading || timeSeriesQuery.isLoading}
    >
      <div className="flex flex-col gap-4">
        {/* Total count metric */}
        <div className="flex justify-center">
          <TotalMetric
            metric={compactNumberFormatter(totalUserCount || 0)}
            description="Total distinct users"
          />
        </div>
        
        {/* Time series chart */}
        {hasData ? (
          <BaseTimeSeriesChart
            agg={agg}
            data={timeSeriesData}
            showLegend={false}
            connectNulls={true}
            valueFormatter={compactNumberFormatter}
            chartType="line"
          />
        ) : (
          <NoDataOrLoading
            isLoading={isLoading || timeSeriesQuery.isLoading}
            description="No user data available for the selected time period"
          />
        )}
      </div>
    </DashboardCard>
  );
}
