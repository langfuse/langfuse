import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/src/components/ui/card";
import { BaseTimeSeriesChart } from "./BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { Loader } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export function ChartGenerations(props: {
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.generations.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Generations</CardTitle>
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
        <BaseTimeSeriesChart
          agg={props.agg}
          data={data.data ?? []}
          connectNulls
        />
      </CardContent>
    </Card>
  );
}

const metricOptions = [
  { label: "Total Tokens", value: "totalTokens" },
  { label: "Prompt Tokens", value: "promptTokens" },
  { label: "Completion Tokens", value: "completionTokens" },
] as const;

export function ChartUsage(props: {
  agg: DateTimeAggregationOption;
  projectId: string;
}) {
  const data = api.dashboard.tokenUsage.useQuery({
    agg: props.agg,
    projectId: props.projectId,
  });

  const [metric, setMetric] =
    useState<(typeof metricOptions)[number]["value"]>("totalTokens");

  // Typesafe selection of metric
  const filteredData =
    (metric === "totalTokens"
      ? data.data?.map((row) => ({
          ts: row.ts,
          values: row.totalTokens,
        }))
      : metric === "promptTokens"
      ? data.data?.map((row) => ({
          ts: row.ts,
          values: row.promptTokens,
        }))
      : data.data?.map((row) => ({
          ts: row.ts,
          values: row.completionTokens,
        }))) ?? [];

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Token Usage</CardTitle>
        <CardDescription></CardDescription>
        <div className="absolute right-5 top-5 ">
          {data.isLoading ? (
            <Loader className="h-5 w-5 animate-spin" />
          ) : (
            <Select
              onValueChange={(value) => setMetric(value as typeof metric)}
              value={metric}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent>
                {metricOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={props.agg}
          data={
            filteredData.map((row) => ({
              ts: row.ts,
              values: Object.entries(row.values ?? []).map(
                ([label, value]) => ({ label, value }),
              ),
            })) ?? []
          }
        />
      </CardContent>
    </Card>
  );
}
