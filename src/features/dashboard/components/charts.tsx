import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { BaseTimeSeriesChart } from "./BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseriesAggregation";

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
      <CardHeader>
        <CardTitle>LLM calls</CardTitle>
        <CardDescription>Count</CardDescription>
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
      <CardHeader>
        <CardTitle>Traces</CardTitle>
        <CardDescription>Count</CardDescription>
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
      <CardHeader>
        <CardTitle>Scores</CardTitle>
        <CardDescription>Average</CardDescription>
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
    </Card>
  );
}
