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
  name: string;
  createdAt: string;
  countItems: number;
  countRuns: number;
};

export function DatasetsTable(props: { projectId: string }) {
  const datasets = api.datasets.all.useQuery({
    projectId: props.projectId,
  });

  const columns: ColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${key.id}`}
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
      accessorKey: "countItems",
      header: "Items",
    },
    {
      accessorKey: "countRuns",
      header: "Runs",
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["all"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toISOString(),
      name: item.name,
      countItems: item._count.datasetItem,
      countRuns: item._count.datasetRuns,
    };
  };

  return (
    <DataTable
      columns={columns}
      data={
        datasets.isLoading
          ? { isLoading: true, isError: false }
          : datasets.isError
          ? {
              isLoading: false,
              isError: true,
              error: datasets.error.message,
            }
          : {
              isLoading: false,
              isError: false,
              data: datasets.data?.map((t) => convertToTableRow(t)),
            }
      }
      options={{ isLoading: true, isError: false }}
    />
  );
}
