import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { Loader } from "lucide-react";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";

type ChartData = {
  model: string;
  avgDuration: number;
};

type Result = {
  ts: number;
  values: { label: string; value: number }[];
};

export const LatencyChart = ({
  projectId,
  globalFilterState,
  agg,
}: {
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "duration", agg: "AVG" },
      { column: "model", agg: null },
    ],
    filter:
      [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ] ?? [],
    groupBy: [
      { type: "datetime", column: "startTime", temporalUnit: "day" },
      { type: "string", column: "model" },
    ],
    orderBy: [],
  });

  const transformedData = data.data ? transformMap(reduceData(data.data)) : [];

  function reduceData(data: DatabaseRow[]): Map<number, ChartData[]> {
    return data.reduce((acc: Map<number, ChartData[]>, curr: DatabaseRow) => {
      const date = new Date(curr.startTime as Date).getTime();

      const reducedData: ChartData = {
        model: typeof curr.model === "string" ? curr.model : "unknown",
        avgDuration: curr.avgDuration as number,
      };

      if (acc.has(date)) {
        acc.get(date)!.push(reducedData);
      } else {
        acc.set(date, [reducedData]);
      }

      return acc;
    }, new Map<number, ChartData[]>());
  }

  function transformMap(map: Map<number, ChartData[]>): Result[] {
    const result: Result[] = [];

    for (const [date, items] of map) {
      const values = items.map((item) => ({
        label: item.model,
        value: item.avgDuration,
      }));

      result.push({
        ts: date,
        values: values,
      });
    }

    return result;
  }

  return (
    <div className="md:container">
      <Card>
        <CardHeader className="relative">
          <CardTitle>Model latencies</CardTitle>
          <CardDescription>Average latency (ms)</CardDescription>
          {data.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart agg={agg} data={transformedData ?? []} />
        </CardContent>
      </Card>
    </div>
  );
};
