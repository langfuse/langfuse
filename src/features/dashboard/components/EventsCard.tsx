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
    groupBy: [
      {
        type: "datetime",
        column: "startTime",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
    ],
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
    groupBy: [
      {
        type: "datetime",
        column: "timestamp",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
    ],
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
    groupBy: [
      {
        type: "datetime",
        column: "timestamp",
        temporalUnit: dateTimeAggregationSettings[agg].date_trunc,
      },
    ],
    orderBy: [],
  });

  const transformedObservations = observations.data
    ? observations.data.map((item) => {
        return {
          ts: (item.startTime as Date).getTime(),
          values: [
            {
              label: "Observations",
              value:
                typeof item.countObservationId === "number"
                  ? item.countObservationId
                  : undefined,
            },
          ],
        };
      })
    : [];

  const transformedTraces = traces.data
    ? traces.data.map((item) => {
        return {
          ts: (item.timestamp as Date).getTime(),
          values: [
            {
              label: "Traces",
              value:
                typeof item.countTraceId === "number"
                  ? item.countTraceId
                  : undefined,
            },
          ],
        };
      })
    : [];

  const transformedScores = scores.data
    ? scores.data.map((item) => {
        return {
          ts: (item.timestamp as Date).getTime(),
          values: [
            {
              label: "Scores",
              value:
                typeof item.countScoreId === "number"
                  ? item.countScoreId
                  : undefined,
            },
          ],
        };
      })
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader className="relative">
          <CardTitle>Number of traces</CardTitle>
          <CardDescription>Count</CardDescription>
          {traces.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
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
          {observations.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
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
          {scores.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
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
