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
  metadata: string;
};

export function DatasetRunsTable(props: {
  projectId: string;
  datasetId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
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
      accessorKey: "createdAt",
      header: "Created",
    },
    {
      accessorKey: "countRunItems",
      header: "Run Items",
    },
    {
      accessorKey: "avgLatency",
      header: "Latency (avg)",
      cell: ({ row }) => {
        const avgLatency: RowData["avgLatency"] = row.getValue("avgLatency");
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Total Cost (avg)",
      cell: ({ row }) => {
        const avgTotalCost: RowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        return <>{avgTotalCost}</>;
      },
    },
    {
      accessorKey: "scores",
      header: "Scores (avg)",
      cell: ({ row }) => {
        const scores: RowData["scores"] = row.getValue("scores");
        return (
          <GroupedScoreBadges
            scores={Object.entries(scores).map(([k, v]) => ({
              name: k,
              value: v,
            }))}
            variant="headings"
          />
        );
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const metadata: RowData["metadata"] = row.getValue("metadata");
        return <div className="flex flex-wrap gap-x-3 gap-y-1">{metadata}</div>;
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
      metadata: JSON.stringify(item.metadata),
    };
  };

  return (
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
    />
  );
}
