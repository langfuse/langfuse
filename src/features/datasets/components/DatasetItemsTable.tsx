import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { NewDatasetItemButton } from "@/src/features/datasets/components/NewDatasetItemButton";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { type ColumnDef } from "@tanstack/react-table";

type RowData = {
  id: string;
  createdAt: string;
  input: string;
  expectedOutput: string;
};

export function DatasetItemsTable({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) {
  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId,
    datasetId,
  });

  const columns: ColumnDef<RowData>[] = [
    {
      accessorKey: "id",
      header: "Item id",
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        return (
          <TableLink
            path={`/project/${projectId}/datasets/${datasetId}/items/${id}`}
            value={id}
            truncateAt={7}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
    },
    {
      accessorKey: "input",
      header: "Input",
    },
    {
      accessorKey: "expectedOutput",
      header: "Expected Output",
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["itemsByDatasetId"][number],
  ): RowData => {
    return {
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      input: JSON.stringify(item.input),
      expectedOutput: JSON.stringify(item.expectedOutput),
    };
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <NewDatasetItemButton projectId={projectId} datasetId={datasetId} />
      </div>
      <DataTable
        columns={columns}
        data={
          items.isLoading
            ? { isLoading: true, isError: false }
            : items.isError
            ? {
                isLoading: false,
                isError: true,
                error: items.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: items.data?.map((t) => convertToTableRow(t)),
              }
        }
        options={{ isLoading: true, isError: false }}
      />
    </div>
  );
}
