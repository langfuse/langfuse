import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { getDatasetRunAggregateColumnProps } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { useDatasetRunAggregateColumns } from "@/src/features/datasets/hooks/useDatasetRunAggregateColumns";
import { type ScoreAggregate } from "@/src/features/scores/lib/types";
import { api } from "@/src/utils/api";
import { type Prisma } from "@langfuse/shared";
import { NumberParam } from "use-query-params";
import { useQueryParams, withDefault } from "use-query-params";
import { useMemo } from "react";
import { usdFormatter } from "@/src/utils/numbers";

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

export function DatasetCompareRunsTable(props: {
  projectId: string;
  datasetId: string;
  runIds?: string[];
}) {
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetCompareRuns",
    "s",
  );

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

  // Individual queries for each run
  const runs = (props.runIds ?? []).map((runId) => ({
    runId,
    items: api.datasets.runitemsByRunIdOrItemId.useQuery(
      {
        projectId: props.projectId,
        datasetRunId: runId,
        page: paginationState.pageIndex,
        limit: paginationState.pageSize,
      },
      {
        staleTime: 5 * 60 * 1000,
        enabled: baseDatasetItems.isSuccess,
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

    return baseDatasetItems.data?.map(
      (item): DatasetCompareRunRowData => ({
        id: item.id,
        input: item.input ?? null,
        expectedOutput: item.expectedOutput ?? null,
        metadata: item.metadata ?? null,
        runs: runData[item.id] || {},
      }),
    );
  }, [baseDatasetItems.data, runs]);

  const runNames = api.datasets.runNamesByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
  });

  const { runAggregateColumns, isColumnLoading } =
    useDatasetRunAggregateColumns({
      projectId: props.projectId,
      runIds: props.runIds ?? [],
      runNames: runNames.data ?? [],
      cellsLoading: !runNames.data,
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
          <IOTableCell data={input} singleLine={rowHeight === "s"} />
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
          <IOTableCell
            data={expectedOutput}
            className="bg-accent-light-green"
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const metadata = row.getValue(
          "metadata",
        ) as DatasetCompareRunRowData["metadata"];
        return metadata !== null ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
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
        setRowHeight={setRowHeight}
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
          totalCount: baseDatasetItems.data?.length ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
      />
    </>
  );
}
