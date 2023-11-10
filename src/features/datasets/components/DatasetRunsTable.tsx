import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { type ColumnDef } from "@tanstack/react-table";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  createdAt: string;
  countRunItems: string;
  avgLatency: number;
  scores: RouterOutput["datasets"]["runsByDatasetId"][number]["scores"];
};

export function DatasetRunsTable(props: {
  projectId: string;
  datasetId: string;
}) {
  const runs = api.datasets.runsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
  });

  const columns: ColumnDef<RowData>[] = [
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
        return <>{avgLatency.toFixed(2)} sec</>;
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
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["runsByDatasetId"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toISOString(),
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      scores: item.scores,
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
              data: runs.data?.map((t) => convertToTableRow(t)),
            }
      }
    />
  );
}
