import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
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
import { ScoreDataType, type Prisma } from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  createdAt: string;
  countRunItems: string;
  avgLatency: number;
  avgTotalCost: string;
  scores: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number]["scores"];
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
  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      id: "key",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${key.id}`}
            value={key.name}
            truncateAt={50}
          />
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      id: "description",
      enableHiding: true,
    },
    {
      accessorKey: "countRunItems",
      header: "Run Items",
      id: "countRunItems",
      enableHiding: true,
    },
    {
      accessorKey: "avgLatency",
      header: "Latency (avg)",
      id: "avgLatency",
      enableHiding: true,
      cell: ({ row }) => {
        const avgLatency: RowData["avgLatency"] = row.getValue("avgLatency");
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Total Cost (avg)",
      id: "avgTotalCost",
      enableHiding: true,
      cell: ({ row }) => {
        const avgTotalCost: RowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        return <>{avgTotalCost}</>;
      },
    },
    {
      accessorKey: "scores",
      header: "Scores (avg)",
      id: "scores",
      enableHiding: true,
      cell: ({ row }) => {
        const scores: RowData["scores"] = row.getValue("scores");
        return (
          <GroupedScoreBadges
            scores={Object.entries(scores).map(([k, v]) => ({
              name: k,
              value: v,
              dataType: ScoreDataType.NUMERIC, // numeric and boolean values treated as numeric
            }))}
            variant="headings"
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      enableHiding: true,
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      enableHiding: true,
      cell: ({ row }) => {
        const metadata: RowData["metadata"] = row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toLocaleString(),
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      avgTotalCost: usdFormatter(item.avgTotalCost.toNumber()),
      scores: item.scores,
      description: item.description ?? "",
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "datasetRunsColumnVisibility",
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
          pageCount: Math.ceil(
            (runs.data?.totalRuns ?? 0) / paginationState.pageSize,
          ),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        rowHeight={rowHeight}
      />
    </>
  );
}
