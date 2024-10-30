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
import { api, type RouterOutputs } from "@/src/utils/api";
import { type Prisma } from "@langfuse/shared";
import { NumberParam } from "use-query-params";
import { useQueryParams, withDefault } from "use-query-params";

export type RunMetrics = {
  // scores: ScoreAggregate;
  // output: Prisma.JsonValue;
  // resourceMetrics: {
  //   latency: number;
  //   totalCost: Prisma.Decimal;
  // };
  traceId: string;
  observationId: string | null;
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

  const runAggregateData = api.datasets.runAggregateByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const { runAggregateColumns } = useDatasetRunAggregateColumns({
    projectId: props.projectId,
    runIds: props.runIds ?? [],
    cellsLoading: false, // !runs.data
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
      ...getDatasetRunAggregateColumnProps(false),
      // ...getDatasetRunAggregateColumnProps(isColumnLoading),
      columns: runAggregateColumns,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetCompareRunRowData>(
      "datasetCompareRunsColumnVisibility",
      columns,
    );

  const convertToTableRow = (
    data: RouterOutputs["datasets"]["runAggregateByDatasetId"][number],
  ): DatasetCompareRunRowData => {
    return {
      id: data.id,
      input: data.input ?? "",
      expectedOutput: data.expectedOutput ?? "",
      metadata: data.metadata ?? "",
      runs: data.runTraceIds,
    };
  };

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
          runAggregateData.isLoading
            ? { isLoading: true, isError: false }
            : runAggregateData.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: runAggregateData.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: runAggregateData.data.map((run) =>
                    convertToTableRow(run),
                  ),
                }
        }
        pagination={{
          totalCount: runAggregateData.data?.length ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
      />
    </>
  );
}
