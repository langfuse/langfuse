import { api } from "@/src/utils/api";
import { type DateTimeAggregationOption } from "@/src/utils/types";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import Link from "next/link";
import { TimeSeriesChart } from "./baseTimeseriesChart";

export function ChartLlmCalls(props: { agg: DateTimeAggregationOption }) {
  const data = api.dashboard.llmCalls.useQuery({ agg: props.agg });

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM calls</CardTitle>
        <CardDescription>Count</CardDescription>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/llm-calls">See all LLM calls</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ChartTraces(props: { agg: DateTimeAggregationOption }) {
  const data = api.dashboard.traces.useQuery({ agg: props.agg });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traces</CardTitle>
        <CardDescription>Count</CardDescription>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/traces">See all traces</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ChartScores(props: { agg: DateTimeAggregationOption }) {
  const data = api.dashboard.scores.useQuery({ agg: props.agg });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scores</CardTitle>
        <CardDescription>Average</CardDescription>
      </CardHeader>
      <CardContent>
        <TimeSeriesChart agg={props.agg} data={data.data ?? []} />
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/scores">See all scores</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
