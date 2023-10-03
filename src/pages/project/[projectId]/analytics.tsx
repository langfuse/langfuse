import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";

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
import { useState } from "react";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { type FilterState } from "@/src/features/filters/types";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Loader } from "lucide-react";
import { numberFormatter } from "@/src/utils/numbers";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [filterState, setFilterState] = useQueryFilterState();

  const globalFilterCols: ColumnDefinition[] = [
    { name: "startTime", type: "datetime", internal: 'o."start_time"' },
  ];

  const initial = [
    {
      column: "startTime",
      operator: "<",
      type: "datetime",
      value: new Date(),
    },
    {
      column: "startTime",
      operator: ">",
      type: "datetime",
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ] as const;

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <FilterBuilder
        columns={globalFilterCols}
        filterState={[...filterState] ?? []}
        onChange={setFilterState}
      />
      <TokenChart
        projectId={projectId}
        globalFilterState={[...filterState, ...initial]}
      />
      <ReleaseTable
        projectId={projectId}
        globalFilterState={[...filterState, ...initial]}
      />
    </div>
  );
}

const TokenChart = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: FilterState;
}) => {
  console.log("globalFilterState.get(observations)", globalFilterState);
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

  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");

  const transformedData = data.data
    ? data.data.map((item) => {
        return {
          ts: (item.startTime as Date).getTime(),
          values: [
            {
              label: "Completion Tokens",
              value: (item.sumCompletionTokens ?? 0) as number,
            },
            {
              label: "Prompt Tokens",
              value: (item.sumPromptTokens ?? 0) as number,
            },
            {
              label: "Total Tokens",
              value: (item.sumTotalTokens ?? 0) as number,
            },
          ],
        };
      })
    : [];

  return (
    <div className="md:container">
      <Header title="Analytics" />
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
          <BaseTimeSeriesChart agg={agg} data={transformedData ?? []} />
        </CardContent>
      </Card>
    </div>
  );
};

const ReleaseTable = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_parent_observation_scores",
    select: [
      { column: "value", agg: "AVG" },
      { column: "release", agg: null },
      { column: "value", agg: "COUNT" },
      { column: "scoreName", agg: null },
      { column: "duration", agg: "AVG" },
    ],
    filter:
      globalFilterState.map((f) => ({
        ...f,
        column: "timestamp",
      })) ?? [],
    groupBy: [
      { type: "string", column: "release" },
      { type: "string", column: "scoreName" },
    ],
    orderBy: [{ column: "release", direction: "DESC" }],
  });

  return (
    <div className="md:container">
      <Header title="Releases" />
      <Card>
        <CardHeader className="relative">
          <CardTitle>Releases</CardTitle>
          <CardDescription>Count</CardDescription>
          {data.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of your recent releases.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Release</TableHead>
                <TableHead className="w-[100px]">Score Name</TableHead>
                <TableHead>Average Score</TableHead>
                <TableHead>Number of traces</TableHead>
                <TableHead className="text-right">
                  Average duration (ms)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data?.map((row) => (
                <TableRow
                  key={(row.release as string) + "-" + (row.name as string)}
                >
                  <TableCell className="font-medium">
                    {row.release ? (row.release as string) : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.name as string}
                  </TableCell>
                  <TableCell>
                    {numberFormatter(row.avgValue as number)}
                  </TableCell>
                  <TableCell>{row.countValue as number}</TableCell>
                  <TableCell className="text-right">
                    {numberFormatter(row.avgDuration as number)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
