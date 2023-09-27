import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { numberFormatter } from "@/src/utils/numbers";
import { AreaChart } from "@tremor/react";

export function BaseTimeSeriesChart(props: {
  agg: DateTimeAggregationOption;
  data: { ts: number; values: { label: string; value: number }[] }[];
  connectNulls?: boolean;
}) {
  const labels = new Set(
    props.data.flatMap((d) => d.values.map((v) => v.label)),
  );

  type ChartInput = { timestamp: string } & { [key: string]: number };

  function transformArray(
    array: { ts: number; values: { label: string; value: number }[] }[],
  ): ChartInput[] {
    return array.map((item) => {
      const outputObject: ChartInput = {
        timestamp: convertDate(item.ts, props.agg),
      } as ChartInput;

      item.values.forEach((valueObject) => {
        outputObject[valueObject.label] = valueObject.value;
      });

      return outputObject;
    });
  }

  const convertDate = (date: number, agg: DateTimeAggregationOption) => {
    if (agg === "24 hours" || agg === "1 hour") {
      return new Date(date).toLocaleTimeString("en-US", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return new Date(date).toLocaleDateString("en-US", {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
    });
  };

  return (
    <AreaChart
      className="mt-4 h-72"
      data={transformArray(props.data)}
      index="timestamp"
      categories={Array.from(labels)}
      connectNulls={props.connectNulls}
      colors={["indigo", "cyan"]}
      valueFormatter={numberFormatter}
      noDataText="Loading ..."
    />
  );
}
