import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { NewDatasetButton } from "@/src/features/datasets/components/NewDatasetButton";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreVertical, Trash } from "lucide-react";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  createdAt: string;
  countItems: number;
  countRuns: number;
};

export function DatasetsTable(props: { projectId: string }) {
  const utils = api.useContext();
  const datasets = api.datasets.all.useQuery({
    projectId: props.projectId,
  });
  const mutDelete = api.datasets.deleteDataset.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
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
    {
      id: "actions",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  mutDelete.mutate({
                    projectId: props.projectId,
                    datasetId: key.id,
                  })
                }
                className="text-destructive"
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["all"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toISOString(),
      countItems: item._count.datasetItem,
      countRuns: item._count.datasetRuns,
    };
  };

  return (
    <div>
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
      <NewDatasetButton projectId={props.projectId} className="mt-4" />
    </div>
  );
}
