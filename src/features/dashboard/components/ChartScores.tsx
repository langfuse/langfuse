import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/src/components/ui/card";

import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";

export function ChartScores(props: {
  className?: string;
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.scores.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  return (
    <DashboardCard
      className={props.className}
      title="Scores"
      description="Average"
      isLoading={data.isLoading}
    >
      <BaseTimeSeriesChart
        agg={props.agg}
        data={data.data ?? []}
        connectNulls
      />
    </DashboardCard>
  );
}
