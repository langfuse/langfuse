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

export const TokenChart = ({
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
      { column: "completionTokens", agg: "SUM" },
      { column: "promptTokens", agg: "SUM" },
      { column: "totalTokens", agg: "SUM" },
    ],
    filter: globalFilterState ?? [],
    groupBy: [{ type: "datetime", column: "startTime", temporalUnit: "day" }],
    orderBy: [],
  });

  const transformedData = data.data
    ? data.data.map((item) => {
        const values = [
          ...(typeof item.sumCompletionTokens === "number"
            ? [
                {
                  label: "Completion Tokens",
                  value: item.sumCompletionTokens,
                },
              ]
            : []),
          ...(typeof item.sumPromptTokens === "number"
            ? [
                {
                  label: "Prompt Tokens",
                  value: item.sumPromptTokens,
                },
              ]
            : []),
          ...(typeof item.sumTotalTokens === "number"
            ? [
                {
                  label: "Total Tokens",
                  value: item.sumTotalTokens,
                },
              ]
            : []),
        ];

        console.log(values);
        return {
          ts: (item.startTime as Date).getTime(),
          values: values,
        };
      })
    : [];

  const filteredTimestamps = transformedData.filter(
    (item) => item.values.length > 0,
  );

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle>Number of tokens</CardTitle>
        <CardDescription>Count</CardDescription>
        {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={agg}
          data={filteredTimestamps ?? []}
          connectNulls={true}
        />
      </CardContent>
    </Card>
  );
};
