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
