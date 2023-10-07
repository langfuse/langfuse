import { type TimeSeriesChartDataPoint } from "./base/BaseTimeSeriesChart";
import { type FilterState } from "@/src/features/filters/types";
import { type DatabaseRow } from "@/src/server/api/services/query-builder";
import { api } from "@/src/utils/api";

export const getAllModels = (
  projectId: string,
  globalFilterState: FilterState,
) => {
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
    limit: null,
  });

  return allModels.data ? extractAllModels(allModels.data) : [];
};

const extractAllModels = (data: DatabaseRow[]): string[] => {
  return data.map((item) => item.model as string);
};

type Field = string;

type ChartData = {
  model: string;
  value?: number;
};

export function reduceData(
  data: DatabaseRow[],
  field: Field,
): Map<number, ChartData[]> {
  return data.reduce((acc: Map<number, ChartData[]>, curr: DatabaseRow) => {
    const date = new Date(curr.startTime as Date).getTime();

    const reducedData: ChartData | undefined = curr.model
      ? {
          model: curr.model as string,
          value: typeof curr[field] === "number" ? (curr[field] as number) : 0,
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

export function transformMapAndFillZeroValues(
  map: Map<number, ChartData[]>,
  allModels: string[],
): TimeSeriesChartDataPoint[] {
  const result: TimeSeriesChartDataPoint[] = [];

  for (const [date, items] of map) {
    const values = items.map((item) => ({
      label: item.model,
      value: item.value,
    }));

    for (const model of allModels) {
      if (!values.find((value) => value.label === model)) {
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
