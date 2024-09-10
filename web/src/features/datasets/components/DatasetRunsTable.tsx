import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

import { type RouterOutput } from "@/src/utils/types";
import { useEffect } from "react";
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
import { type ScoreAggregate } from "@/src/features/scores/lib/types";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";

type DatasetRunRowKey = {
  id: string;
  name: string;
};

export type DatasetRunRowData = {
  key: DatasetRunRowKey;
  createdAt: string;
  countRunItems: string;
  avgLatency: number;
  avgTotalCost: string;
  // scores holds grouped column with individual scores
  scores?: ScoreAggregate;
  description: string;
  metadata: Prisma.JsonValue;
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

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetRuns",
    "s",
  );
  const runs = api.datasets.runsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const { setDetailPageList } = useDetailPageLists();
  useEffect(() => {
    if (runs.isSuccess) {
      setDetailPageList(
        "datasetRuns",
        runs.data.runs.map((t) => t.id),
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
      accessorKey: "key",
      header: "Name",
      id: "key",
      size: 150,
      isPinned: true,
      cell: ({ row }) => {
        const key: DatasetRunRowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${key.id}`}
            value={key.name}
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
        const key: DatasetRunRowKey = row.getValue("key");
        const { id: datasetRunId } = key;

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
                datasetRunId={datasetRunId}
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
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toLocaleString(),
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      avgTotalCost: usdFormatter(item.avgTotalCost.toNumber()),
      scores: verifyAndPrefixScoreDataAgainstKeys(
        scoreKeysAndProps,
        item.scores,
      ),
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
        actionButtons={props.menuItems}
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
                  data: runs.data.runs.map((t) => convertToTableRow(t)),
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
      />
    </>
  );
}
