import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/src/components/ui/card";
import { BaseTimeSeriesChart } from "./base/BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { Loader } from "lucide-react";

export function ChartScores(props: {
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.scores.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Scores</CardTitle>
        <CardDescription>Average</CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={props.agg}
          data={data.data ?? []}
          connectNulls
        />
      </CardContent>
    </Card>
  );
}
