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
      accessorKey: "scores",
      header: "Scores (avg)",
      cell: ({ row }) => {
        const scores: RowData["scores"] = row.getValue("scores");
        return (
          <div className="flex items-center gap-3">
            {Object.entries(scores)
              .sort(([aName], [bName]) => aName.localeCompare(bName))
              .map(([name, _value]) => (
                <div key={name}>
                  <div className="text-xs text-gray-500">{name}</div>
                  <div className="text-sm">{}</div>
                </div>
              ))}
          </div>
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
      options={{ isLoading: true, isError: false }}
    />
  );
}
