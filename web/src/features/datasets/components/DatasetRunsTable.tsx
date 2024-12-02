import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect, useState } from "react";
import { usdFormatter } from "../../../utils/numbers";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type Prisma } from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import { ChevronDown, Columns3, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { Checkbox } from "@/src/components/ui/checkbox";
import { type RowSelectionState } from "@tanstack/react-table";
import Link from "next/link";
import { useClickhouse } from "@/src/components/layouts/ClickhouseAdminToggle";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";

export type DatasetRunRowData = {
  id: string;
  name: string;
  createdAt: string;
  countRunItems: string;
  avgLatency: number | undefined;
  avgTotalCost: string | undefined;
  // scores holds grouped column with individual scores
  scores?: ScoreAggregate | undefined;
  description: string;
  metadata: Prisma.JsonValue;
};

const DatasetRunTableMultiSelectAction = ({
  selectedRunIds,
  projectId,
  datasetId,
}: {
  selectedRunIds: string[];
  projectId: string;
  datasetId: string;
}) => {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={selectedRunIds.length < 1}>
            Actions ({selectedRunIds.length} selected)
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <Link
            href={
              selectedRunIds.length < 2
                ? "#"
                : {
                    pathname: `/project/${projectId}/datasets/${datasetId}/compare`,
                    query: { runs: selectedRunIds },
                  }
            }
          >
            <DropdownMenuItem disabled={selectedRunIds.length < 2}>
              <Columns3 className="mr-2 h-4 w-4" />
              <span>Compare</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export function DatasetRunsTable(props: {
  projectId: string;
  datasetId: string;
  menuItems?: React.ReactNode;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetRuns",
    "s",
  );
  const runs = api.datasets.runsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    queryClickhouse: useClickhouse(),
  });

  const runsMetrics = api.datasets.runsByDatasetIdMetrics.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    queryClickhouse: useClickhouse(),
  });

  type DatasetsCoreOutput =
    RouterOutput["datasets"]["runsByDatasetId"]["runs"][number];
  type DatasetsMetricOutput =
    RouterOutput["datasets"]["runsByDatasetIdMetrics"]["runs"][number];

  const runsWithMetrics = joinTableCoreAndMetrics<
    DatasetsCoreOutput,
    DatasetsMetricOutput
  >(runs.data?.runs, runsMetrics.data?.runs);

  const { setDetailPageList } = useDetailPageLists();
  useEffect(() => {
    if (runs.isSuccess) {
      setDetailPageList(
        "datasetRuns",
        runs.data.runs.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.isSuccess, runs.data]);

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<DatasetRunRowData>({
      projectId: props.projectId,
      scoreColumnKey: "scores",
      showAggregateViewOnly: true,
    });

  const columns: LangfuseColumnDef<DatasetRunRowData>[] = [
    {
      id: "select",
      accessorKey: "select",
      size: 30,
      isPinned: true,
      header: ({ table }) => {
        return (
          <div className="flex h-full items-center">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected()
                  ? true
                  : table.getIsSomePageRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(value) => {
                table.toggleAllPageRowsSelected(!!value);
                if (!value) {
                  setSelectedRows({});
                }
              }}
              aria-label="Select all"
              className="opacity-60"
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="mt-1 opacity-60 data-[state=checked]:mt-[5px]"
          />
        );
      },
    },
    {
      accessorKey: "id",
      header: "Id",
      id: "id",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const id: DatasetRunRowData["id"] = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${id}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      isPinned: true,
      cell: ({ row }) => {
        const name: DatasetRunRowData["name"] = row.getValue("name");
        const id: DatasetRunRowData["id"] = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${id}`}
            value={name}
          />
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      id: "description",
      size: 300,
      enableHiding: true,
    },
    {
      accessorKey: "countRunItems",
      header: "Run Items",
      id: "countRunItems",
      size: 90,
      enableHiding: true,
    },
    {
      accessorKey: "avgLatency",
      header: "Latency (avg)",
      id: "avgLatency",
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const avgLatency: DatasetRunRowData["avgLatency"] =
          row.getValue("avgLatency");
        if (avgLatency === undefined) return <Skeleton className="h-3 w-1/2" />;
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Total Cost (avg)",
      id: "avgTotalCost",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const avgTotalCost: DatasetRunRowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        if (!avgTotalCost) return <Skeleton className="h-3 w-1/2" />;
        return <>{avgTotalCost}</>;
      },
    },
    { ...getScoreGroupColumnProps(isColumnLoading), columns: scoreColumns },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      size: 150,
      enableHiding: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const metadata: DatasetRunRowData["metadata"] =
          row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      size: 70,
      cell: ({ row }) => {
        const id: DatasetRunRowData["id"] = row.getValue("id");

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only [position:relative]">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DeleteDatasetRunButton
                projectId={props.projectId}
                datasetRunId={id}
                fullWidth
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number],
  ): DatasetRunRowData => {
    return {
      id: item.id,
      name: item.name,
      createdAt: item.createdAt.toLocaleString(),
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      avgTotalCost: item.avgTotalCost
        ? usdFormatter(item.avgTotalCost.toNumber())
        : undefined,
      scores: item.scores
        ? verifyAndPrefixScoreDataAgainstKeys(scoreKeysAndProps, item.scores)
        : undefined,
      description: item.description ?? "",
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunRowData>(
      `datasetRunsColumnVisibility-${props.projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<DatasetRunRowData>(
    "datasetRunsColumnOrder",
    columns,
  );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={[
          props.menuItems,
          Object.keys(selectedRows).filter((runId) =>
            runs.data?.runs.map((run) => run.id).includes(runId),
          ).length > 0 ? (
            <DatasetRunTableMultiSelectAction
              // Exclude items that are not in the current page
              selectedRunIds={Object.keys(selectedRows).filter((runId) =>
                runs.data?.runs.map((run) => run.id).includes(runId),
              )}
              projectId={props.projectId}
              datasetId={props.datasetId}
            />
          ) : null,
        ]}
      />
      <DataTable
        columns={columns}
        data={
          runs.isLoading
            ? { isLoading: true, isError: false }
            : runs.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: runs.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: (runsWithMetrics.rows ?? []).map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount: runs.data?.totalRuns ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
        rowSelection={selectedRows}
        setRowSelection={setSelectedRows}
      />
    </>
  );
}
