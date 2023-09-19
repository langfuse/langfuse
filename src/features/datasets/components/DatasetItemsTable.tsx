import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { NewDatasetItemButton } from "@/src/features/datasets/components/NewDatasetItemButton";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Archive, MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { DatasetItemStatus, type DatasetItem } from "@prisma/client";
import { cn } from "@/src/utils/tailwind";

type RowData = {
  id: string;
  status: DatasetItem["status"];
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
  const utils = api.useContext();
  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId,
    datasetId,
  });

  const mutArchive = api.datasets.archiveDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status: DatasetItemStatus = row.getValue("status");
        return (
          <div>
            <div
              className={cn(
                status === DatasetItemStatus.ACTIVE
                  ? "text-green-950"
                  : "text-gray-700",
              )}
            >
              {status}
            </div>
          </div>
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
    {
      id: "actions",
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        const status: DatasetItemStatus = row.getValue("status");
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
                  mutArchive.mutate({
                    projectId: projectId,
                    datasetId: datasetId,
                    datasetItemId: id,
                  })
                }
                disabled={status === DatasetItemStatus.ARCHIVED}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["itemsByDatasetId"][number],
  ): RowData => {
    return {
      id: item.id,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      input: JSON.stringify(item.input).slice(0, 50) + "...",
      expectedOutput:
        item.expectedOutput !== null
          ? JSON.stringify(item.expectedOutput).slice(0, 50) + "..."
          : "",
    };
  };

  return (
    <div>
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
      <NewDatasetItemButton
        projectId={projectId}
        datasetId={datasetId}
        className="mt-4"
      />
    </div>
  );
}
