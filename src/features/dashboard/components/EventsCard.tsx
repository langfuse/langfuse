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

export const EventsCard = ({
  projectId,
  globalFilterState,
  agg,
}: {
  projectId: string;
  globalFilterState: FilterState;
  agg: DateTimeAggregationOption;
}) => {
  const observations = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [{ column: "observationId", agg: "COUNT" }],
    filter: globalFilterState ?? [],
    groupBy: [{ type: "datetime", column: "startTime", temporalUnit: "day" }],
    orderBy: [],
  });

  const traces = api.dashboard.chart.useQuery({
    projectId,
    from: "traces",
    select: [{ column: "traceId", agg: "COUNT" }],
    filter:
      globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ) ?? [],
    groupBy: [{ type: "datetime", column: "timestamp", temporalUnit: "day" }],
    orderBy: [],
  });

  const scores = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_scores",
    select: [{ column: "scoreId", agg: "COUNT" }],
    filter:
      globalFilterState.map((f) =>
        f.type === "datetime" ? { ...f, column: "timestamp" } : f,
      ) ?? [],
    groupBy: [{ type: "datetime", column: "timestamp", temporalUnit: "day" }],
    orderBy: [],
  });

  console.log("###", observations.data, traces.data);

  const transformedObservations = observations.data
    ? observations.data.map((item) => {
        const values = [
          ...(typeof item.countObservationId === "number"
            ? [
                {
                  label: "Observations",
                  value: item.countObservationId,
                },
              ]
            : []),
        ];

        return {
          ts: (item.startTime as Date).getTime(),
          values: values,
        };
      })
    : [];

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        const values = [
          ...(typeof item.countTraceId === "number"
            ? [
                {
                  label: "Traces",
                  value: item.countTraceId,
                },
              ]
            : []),
        ];

        return {
          ts: (item.timestamp as Date).getTime(),
          values: values,
        };
      })
    : [];

  const transformedScores = scores.data
    ? scores.data.map((item) => {
        const values = [
          ...(typeof item.countScoreId === "number"
            ? [
                {
                  label: "Scores",
                  value: item.countScoreId,
                },
              ]
            : []),
        ];

        return {
          ts: (item.timestamp as Date).getTime(),
          values: values,
        };
      })
    : [];

  // const transformedData = data.data
  //   ? data.data.map((item) => {
  //       const values = [
  //         ...(typeof item.sumCompletionTokens === "number"
  //           ? [
  //               {
  //                 label: "Completion Tokens",
  //                 value: item.sumCompletionTokens,
  //               },
  //             ]
  //           : []),
  //         ...(typeof item.sumPromptTokens === "number"
  //           ? [
  //               {
  //                 label: "Prompt Tokens",
  //                 value: item.sumPromptTokens,
  //               },
  //             ]
  //           : []),
  //         ...(typeof item.sumTotalTokens === "number"
  //           ? [
  //               {
  //                 label: "Total Tokens",
  //                 value: item.sumTotalTokens,
  //               },
  //             ]
  //           : []),
  //       ];

  //       return {
  //         ts: (item.startTime as Date).getTime(),
  //         values: values,
  //       };
  //     })
  //   : [];

  // const filteredTimestamps = transformedData.filter(
  //   (item) => item.values.length > 0,
  // );

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader className="relative">
          <CardTitle>Number of traces</CardTitle>
          <CardDescription>Count</CardDescription>
          {/* {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null} */}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart
            agg={agg}
            data={transformedTraces ?? []}
            connectNulls={true}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="relative">
          <CardTitle>Number of observations</CardTitle>
          <CardDescription>Count</CardDescription>
          {/* {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null} */}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart
            agg={agg}
            data={transformedObservations ?? []}
            connectNulls={true}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="relative">
          <CardTitle>Number of scores</CardTitle>
          <CardDescription>Count</CardDescription>
          {/* {data.isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null} */}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart
            agg={agg}
            data={transformedScores ?? []}
            connectNulls={true}
          />
        </CardContent>
      </Card>
    </div>
  );
};
