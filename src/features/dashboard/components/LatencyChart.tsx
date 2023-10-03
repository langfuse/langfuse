import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type FilterState } from "@/src/features/filters/types";
import { Loader } from "lucide-react";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";

type ChartData = {
  model: string;
  avgDuration?: number;
};

type Result = {
  ts: number;
  values: { label: string; value?: number }[];
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
      {
        type: "datetime",
        column: "startTime",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
      { type: "string", column: "model" },
    ],
    orderBy: [],
  });

  const allModels = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [{ column: "model", agg: null }],
    filter:
      [
        ...globalFilterState,
        { type: "string", column: "type", operator: "=", value: "GENERATION" },
      ] ?? [],
    groupBy: [{ type: "string", column: "model" }],
    orderBy: [],
  });

  const extractAllModels = (data: DatabaseRow[]): string[] => {
    return data.map((item) => item.model as string);
  };

  const transformedData =
    data.data && allModels.data
      ? transformMap(reduceData(data.data), extractAllModels(allModels.data))
      : [];

  function reduceData(data: DatabaseRow[]): Map<number, ChartData[]> {
    return data.reduce((acc: Map<number, ChartData[]>, curr: DatabaseRow) => {
      const date = new Date(curr.startTime as Date).getTime();

      const reducedData: ChartData | undefined = curr.model
        ? {
            model: curr.model as string,
            avgDuration:
              typeof curr.avgDuration === "number" ? curr.avgDuration : 0,
          }
        : undefined;

      if (acc.has(date)) {
        reducedData ? acc.get(date)!.push(reducedData) : null;
      } else {
        acc.set(date, reducedData ? [reducedData] : []);
      }

      return acc;
    }, new Map<number, ChartData[]>());
  }

  function transformMap(
    map: Map<number, ChartData[]>,
    allModels: string[],
  ): Result[] {
    const result: Result[] = [];

    for (const [date, items] of map) {
      const values = items.map((item) => ({
        label: item.model,
        value: item.avgDuration,
      }));

      // check that values.laebel has all values in allModels. if not add {label: model, value: 0}
      for (const model of allModels) {
        if (!values.find((item) => item.label === model)) {
          values.push({ label: model, value: 0 });
        }
      }

      result.push({
        ts: date,
        values: values,
      });
    }

    return result;
  }

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Model latencies</CardTitle>
        <CardDescription>
          Average latency (ms) per LLM generation
        </CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={agg}
          data={transformedData ?? []}
          connectNulls={true}
        />
      </CardContent>
    </Card>
  );
};
