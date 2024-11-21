import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { getDatasetRunAggregateColumnProps } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { useDatasetRunAggregateColumns } from "@/src/features/datasets/hooks/useDatasetRunAggregateColumns";
import { type ScoreAggregate } from "@langfuse/shared";
import { type Prisma } from "@langfuse/shared";
import { NumberParam } from "use-query-params";
import { useQueryParams, withDefault } from "use-query-params";
import { useMemo, useState, useCallback } from "react";
import { usdFormatter } from "@/src/utils/numbers";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { ChevronDown, Expand, Rows3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DatasetCompareRunPeekView } from "@/src/features/datasets/components/DatasetCompareRunPeekView";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";
import { getQueryKey } from "@trpc/react-query";
import { useQueryClient } from "@tanstack/react-query";

export type RunMetrics = {
  id: string;
  scores: ScoreAggregate;
  resourceMetrics: {
    latency?: number;
    totalCost?: string;
  };
  traceId: string;
  observationId: string | undefined;
};

export type RunAggregate = Record<string, RunMetrics>;

export type DatasetCompareRunRowData = {
  id: string;
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  // runs holds grouped column with individual run metrics
  runs?: RunAggregate;
};

const getRefetchInterval = (
  runId: string,
  localExperiments: { key: string; value: string }[],
  unchangedCounts: Record<string, number>,
) => {
  if (unchangedCounts[runId] < 2) return 5000;
  if (localExperiments.some((run) => run.key === runId)) return 3000;
  return false;
};

const DATASET_RUN_METRICS = ["scores", "resourceMetrics"] as const;
export type DatasetRunMetric = (typeof DATASET_RUN_METRICS)[number];

export function DatasetCompareRunsTable(props: {
  projectId: string;
  datasetId: string;
  runIds: string[];
  runsData?: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
  localExperiments: { key: string; value: string }[];
}) {
  const [selectedMetrics, setSelectedMetrics] = useState<DatasetRunMetric[]>([
    "scores",
    "resourceMetrics",
  ]);
  const [isMetricsDropdownOpen, setIsMetricsDropdownOpen] = useState(false);
  const [clickedRow, setClickedRow] = useState<DatasetCompareRunRowData | null>(
    null,
  );
  const [traceAndObservationId, setTraceAndObservationId] = useState<{
    runId: string;
    traceId: string;
    observationId?: string;
  } | null>(null);
  const [unchangedCounts, setUnchangedCounts] = useState<
    Record<string, number>
  >({});
  const queryClient = useQueryClient();

  const rowHeight = "l";

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const baseDatasetItems = api.datasets.baseDatasetItemByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const queryClickhouse = useClickhouse();

  // 1. First, separate the run definitions
  const runQueries = useMemo(
    () =>
      (props.runIds ?? []).map((runId) => ({
        runId,
        queryKey: getQueryKey(api.datasets.runitemsByRunIdOrItemId, {
          projectId: props.projectId,
          datasetRunId: runId,
          page: paginationState.pageIndex,
          limit: paginationState.pageSize,
          queryClickhouse,
        }),
      })),
    [
      props.runIds,
      props.projectId,
      paginationState.pageIndex,
      paginationState.pageSize,
      queryClickhouse,
    ],
  );

  // 2. Track changes using onSuccess callback in the queries instead of useEffect
  const handleQuerySuccess = useCallback(
    (runId: string, newData: any) => {
      setUnchangedCounts((prev) => {
        const prevCount = prev[runId] || 0;
        const queryKey = runQueries.find((r) => r.runId === runId)?.queryKey;
        const prevData = queryClient.getQueryData(queryKey || []);

        // Only increment if we have previous data and it matches the new data
        if (prevData && JSON.stringify(prevData) === JSON.stringify(newData)) {
          const newCount = prevCount + 1;
          return { ...prev, [runId]: newCount };
        }

        return { ...prev, [runId]: 0 };
      });
    },
    [queryClient, runQueries],
  );

  // 3. Use the queries with success callback
  const runs = runQueries.map(({ runId }) => ({
    runId,
    items: api.datasets.runitemsByRunIdOrItemId.useQuery(
      {
        projectId: props.projectId,
        datasetRunId: runId,
        page: paginationState.pageIndex,
        limit: paginationState.pageSize,
        queryClickhouse,
      },
      {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: 5 * 60 * 1000,
        enabled: baseDatasetItems.isSuccess,
        refetchInterval: getRefetchInterval(
          runId,
          props.localExperiments,
          unchangedCounts,
        ),
        onSuccess: (data) => handleQuerySuccess(runId, data),
      },
    ),
  }));

  const combinedData = useMemo(() => {
    if (!baseDatasetItems.data) return null;

    const runData = runs.reduce<Record<string, RunAggregate>>(
      (itemsAcc, { runId, items }) => {
        if (!items.data) return itemsAcc;

        items.data.runItems.forEach(
          ({ datasetItemId, trace, observation, scores }) => {
            if (!itemsAcc[datasetItemId]) itemsAcc[datasetItemId] = {};

            itemsAcc[datasetItemId][runId] = {
              id: runId,
              traceId: trace?.id ?? "",
              observationId: observation?.id ?? undefined,
              resourceMetrics: {
                latency:
                  (!!observation ? observation.latency : trace?.duration) ??
                  undefined,
                totalCost:
                  (!!observation?.calculatedTotalCost
                    ? usdFormatter(observation.calculatedTotalCost.toNumber())
                    : usdFormatter(trace?.totalCost)) ?? undefined,
              },
              scores,
            };
          },
        );

        return itemsAcc;
      },
      {},
    );

    return baseDatasetItems.data?.datasetItems.map(
      (item): DatasetCompareRunRowData => ({
        id: item.id,
        input: item.input ?? "null",
        expectedOutput: item.expectedOutput ?? "null",
        metadata: item.metadata ?? "null",
        runs: runData?.[item.id] || {},
      }),
    );
  }, [baseDatasetItems.data, runs]);

  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery(
    {
      projectId: props.projectId,
      selectedTimeOption: { filterSource: "TABLE", option: "All time" },
    },
    {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const scoreKeyToDisplayName = useMemo(() => {
    if (!scoreKeysAndProps.data) return new Map<string, string>();
    return new Map(
      scoreKeysAndProps.data.map(({ key, dataType, source, name }) => [
        key,
        `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
      ]),
    );
  }, [scoreKeysAndProps.data]);

  const { runAggregateColumns, isColumnLoading } =
    useDatasetRunAggregateColumns({
      projectId: props.projectId,
      runIds: props.runIds,
      runsData: props.runsData ?? [],
      scoreKeyToDisplayName,
      cellsLoading: !scoreKeysAndProps.data,
      selectedMetrics,
    });

  const columns: LangfuseColumnDef<DatasetCompareRunRowData>[] = [
    {
      accessorKey: "id",
      header: "Item id",
      id: "id",
      size: 90,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/items/${id}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const input = row.getValue(
          "input",
        ) as DatasetCompareRunRowData["input"];
        return input !== null ? (
          <div className="group relative h-full w-full">
            <Button
              variant="outline"
              size="icon"
              className="absolute right-1 top-1 z-[5] hidden items-center justify-center group-hover:flex"
              onClick={() => {
                setTraceAndObservationId(null);
                setClickedRow(row.original);
              }}
            >
              <Expand className="h-4 w-4" />
            </Button>
            <IOTableCell data={input} />
          </div>
        ) : null;
      },
    },
    {
      accessorKey: "expectedOutput",
      header: "Expected Output",
      id: "expectedOutput",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const expectedOutput = row.getValue(
          "expectedOutput",
        ) as DatasetCompareRunRowData["expectedOutput"];
        return expectedOutput !== null ? (
          <div className="group relative h-full w-full">
            <Button
              variant="outline"
              size="icon"
              className="absolute right-1 top-1 z-[5] hidden items-center justify-center group-hover:flex"
              onClick={() => {
                setTraceAndObservationId(null);
                setClickedRow(row.original);
              }}
            >
              <Expand className="h-4 w-4" />
            </Button>
            <IOTableCell
              data={expectedOutput}
              className="bg-accent-light-green"
            />
          </div>
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const metadata = row.getValue(
          "metadata",
        ) as DatasetCompareRunRowData["metadata"];
        return metadata !== null ? <IOTableCell data={metadata} /> : null;
      },
    },
    {
      ...getDatasetRunAggregateColumnProps(isColumnLoading),
      columns: runAggregateColumns,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetCompareRunRowData>(
      "datasetCompareRunsColumnVisibility",
      columns,
    );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        actionButtons={
          <DropdownMenu open={isMetricsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setIsMetricsDropdownOpen(!isMetricsDropdownOpen)}
              >
                <Rows3 className="mr-2 h-4 w-4" />
                <span className="text-xs text-muted-foreground">Metrics</span>
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onPointerDownOutside={() => setIsMetricsDropdownOpen(false)}
            >
              <DropdownMenuCheckboxItem
                checked={selectedMetrics.includes("scores")}
                onCheckedChange={() => {
                  setSelectedMetrics((prev) =>
                    prev.includes("scores")
                      ? prev.filter((m) => m !== "scores")
                      : [...prev, "scores"],
                  );
                }}
              >
                Scores
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedMetrics.includes("resourceMetrics")}
                onCheckedChange={() =>
                  setSelectedMetrics((prev) =>
                    prev.includes("resourceMetrics")
                      ? prev.filter((m) => m !== "resourceMetrics")
                      : [...prev, "resourceMetrics"],
                  )
                }
              >
                Latency and cost
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <DataTable
        columns={columns}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        data={
          baseDatasetItems.isLoading
            ? { isLoading: true, isError: false }
            : baseDatasetItems.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: baseDatasetItems.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: combinedData ?? [],
                }
        }
        pagination={{
          totalCount: baseDatasetItems.data?.totalCount ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
      />
      {scoreKeysAndProps.isSuccess && (
        <DatasetCompareRunPeekView
          projectId={props.projectId}
          datasetId={props.datasetId}
          scoreKeyToDisplayName={scoreKeyToDisplayName}
          clickedRow={clickedRow}
          setClickedRow={setClickedRow}
          traceAndObservationId={traceAndObservationId}
          setTraceAndObservationId={setTraceAndObservationId}
          runsData={props.runsData ?? []}
        />
      )}
    </>
  );
}
