import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/src/components/ui/card";
import { BaseTimeSeriesChart } from "./BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseriesAggregation";
import { Loader } from "lucide-react";

export function ChartLlmCalls(props: {
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.llmCalls.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>LLM calls</CardTitle>
        <CardDescription>Count</CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
    </Card>
  );
}

export function ChartTraces(props: {
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.traces.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Traces</CardTitle>
        <CardDescription>Count</CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
    </Card>
  );
}

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
        <BaseTimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
    </Card>
  );
}
