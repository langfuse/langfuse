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
import { useEffect, useState } from "react";
import { useFilterState } from "@/src/features/filters/hooks/useFilterState";
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

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [filterState, setFilterState] = useFilterState([
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
  ]);

  const [golbalState, setNewGlobalState] = useState<Map<string, FilterState>>(
    new Map(),
  );

  useEffect(() => {
    setNewGlobalState(
      new Map([
        ["traces", filterState.map((f) => ({ ...f, column: "timestamp" }))],
        ["observations", filterState],
      ]),
    );
  }, [filterState]);

  console.log("global state entries", golbalState.entries());

  const globalFilterCols: ColumnDefinition[] = [
    { name: "startTime", type: "datetime", internal: 'o."start_time"' },
  ];

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <FilterBuilder
        columns={globalFilterCols}
        filterState={golbalState.get("observations") ?? []}
        onChange={setFilterState}
      />
      <TokenChart projectId={projectId} globalFilterState={golbalState} />
      <VersionTable projectId={projectId} globalFilterState={golbalState} />
    </div>
  );
}

const TokenChart = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: Map<string, FilterState>;
}) => {
  console.log(
    "globalFilterState.get(observations)",
    globalFilterState.get("observations"),
  );
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "completionTokens", agg: "SUM" },
      { column: "promptTokens", agg: "SUM" },
      { column: "totalTokens", agg: "SUM" },
    ],
    filter: globalFilterState.get("observations") ?? [],
    groupBy: [{ type: "datetime", column: "startTime", temporalUnit: "day" }],
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

const VersionTable = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: Map<string, FilterState>;
}) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_parent_observation_scores",
    select: [
      { column: "value", agg: "AVG" },
      { column: "version", agg: null },
      { column: "value", agg: "COUNT" },
      { column: "scoreName", agg: null },
      { column: "duration", agg: "AVG" },
    ],
    filter: globalFilterState.get("traces") ?? [],
    groupBy: [
      { type: "string", column: "version" },
      { type: "string", column: "scoreName" },
    ],
  });

  console.log(data);

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
            <TableCaption>A list of your recent trace versions.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Version</TableHead>
                <TableHead className="w-[100px]">Score Name</TableHead>
                <TableHead>Average Score</TableHead>
                <TableHead>Number of traces</TableHead>
                <TableHead className="text-right">Averade duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data?.map((row) => (
                <TableRow key={row.version as string}>
                  <TableCell className="font-medium">
                    {row.version ? (row.version as string) : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.name as string}
                  </TableCell>
                  <TableCell>{row.avgValue as number}</TableCell>
                  <TableCell>{row.countValue as number}</TableCell>
                  <TableCell className="text-right">
                    {row.avgDuration as number}
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
