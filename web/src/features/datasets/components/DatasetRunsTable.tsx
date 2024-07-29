import {
  GroupedScoreBadges,
  QualitativeScoreBadge,
} from "@/src/components/grouped-score-badge";
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
import { cn } from "@/src/utils/tailwind";
import {
  constructDefaultMetricsColumns,
  getDetailMetricsColumns,
} from "@/src/components/table/utils/scoreDetailColumnHelpers";

export type DatasetRunItemRowData = {
  key: {
    id: string;
    name: string;
  };
  createdAt: string;
  countRunItems: string;
  avgLatency: number;
  avgTotalCost: string;
  scores: {
    numeric: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number]["avgNumericScores"];
    qualitative: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number]["qualitativeScoreDistribution"];
  };
  description: string;
  metadata: Prisma.JsonValue;

  // any number of additional detail columns for individual scores
  [key: string]: any; // any of type scores["numeric"] or scores["qualitative"] for detail columns
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
  const columns: LangfuseColumnDef<DatasetRunItemRowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      id: "key",
      cell: ({ row }) => {
        const key: DatasetRunItemRowData["key"] = row.getValue("key");
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
        const avgLatency: DatasetRunItemRowData["avgLatency"] =
          row.getValue("avgLatency");
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Total Cost (avg)",
      id: "avgTotalCost",
      enableHiding: true,
      cell: ({ row }) => {
        const avgTotalCost: DatasetRunItemRowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        return <>{avgTotalCost}</>;
      },
    },
    {
      accessorKey: "scores",
      header: "Score Metrics",
      id: "scores",
      enableHiding: true,
      cell: ({ row }) => {
        const scores: DatasetRunItemRowData["scores"] = row.getValue("scores");
        const { numeric, qualitative } = scores;

        return (
          <div
            className={cn(
              "flex max-w-xl flex-row items-start gap-3 overflow-y-auto",
              rowHeight === "s" && "h-8",
            )}
          >
            <GroupedScoreBadges
              scores={Object.entries(numeric).map(([k, v]) => ({
                name: k,
                value: v,
                dataType: ScoreDataType.NUMERIC,
              }))}
              variant="headings"
            />
            <QualitativeScoreBadge scores={qualitative} />
          </div>
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
        const metadata: DatasetRunItemRowData["metadata"] =
          row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
  ];

  const individualScoreColumns = api.scores.scoreNames.useQuery({
    projectId: props.projectId,
  });

  const convertToTableRow = (
    item: RouterOutput["datasets"]["runsByDatasetId"]["runs"][number],
  ): DatasetRunItemRowData => {
    const detailColumns = getDetailMetricsColumns(
      individualScoreColumns.data?.scoreColumns,
      item.avgNumericScores,
      item.qualitativeScoreDistribution,
    );

    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toLocaleString(),
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      avgTotalCost: usdFormatter(item.avgTotalCost.toNumber()),
      scores: {
        numeric: item.avgNumericScores,
        qualitative: item.qualitativeScoreDistribution,
      },
      description: item.description ?? "",
      metadata: item.metadata,
      ...detailColumns,
    };
  };

  const extendColumns = (
    nativeColumns: LangfuseColumnDef<DatasetRunItemRowData>[],
    detailColumnAccessors?: string[],
  ): LangfuseColumnDef<DatasetRunItemRowData>[] => {
    return [
      ...nativeColumns,
      ...constructDefaultMetricsColumns<DatasetRunItemRowData>(
        detailColumnAccessors ?? [],
      ),
    ];
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunItemRowData>(
      `datasetRunsColumnVisibility-${props.projectId}`,
      individualScoreColumns.isLoading
        ? []
        : extendColumns(columns, individualScoreColumns.data?.scoreColumns),
    );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        detailColumns={constructDefaultMetricsColumns<DatasetRunItemRowData>(
          individualScoreColumns.data?.scoreColumns ?? [],
        )}
        detailColumnHeader="Individual Score Metrics"
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={props.menuItems}
      />
      <DataTable
        columns={columns}
        detailColumns={constructDefaultMetricsColumns<DatasetRunItemRowData>(
          individualScoreColumns.data?.scoreColumns ?? [],
        )}
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
                  data:
                    runs.isSuccess && !individualScoreColumns.isLoading
                      ? runs.data.runs.map((t) => convertToTableRow(t))
                      : [],
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
