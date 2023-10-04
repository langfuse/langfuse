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
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { DatasetStatus } from "@prisma/client";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, MoreVertical } from "lucide-react";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  status: DatasetStatus;
  createdAt: string;
  lastRunAt?: string;
  countItems: number;
  countRuns: number;
};

export function DatasetsTable(props: { projectId: string }) {
  const utils = api.useContext();
  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
  });
  const mutArchive = api.datasets.updateDataset.useMutation({
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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status: DatasetStatus = row.getValue("status");
        return (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                status === DatasetStatus.ACTIVE
                  ? "bg-green-600"
                  : "bg-yellow-600",
              )}
            />
            <span>{status}</span>
          </div>
        );
      },
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
      accessorKey: "createdAt",
      header: "Created",
    },
    {
      accessorKey: "lastRunAt",
      header: "Last Run",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        const status: DatasetStatus = row.getValue("status");
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
                    projectId: props.projectId,
                    datasetId: key.id,
                    status:
                      status === DatasetStatus.ARCHIVED
                        ? DatasetStatus.ACTIVE
                        : DatasetStatus.ARCHIVED,
                  })
                }
              >
                <Archive className="mr-2 h-4 w-4" />
                {status === DatasetStatus.ARCHIVED ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["allDatasets"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toISOString(),
      lastRunAt: item.lastRunAt?.toISOString() ?? "",
      status: item.status,
      countItems: item.countDatasetItems,
      countRuns: item.countDatasetRuns,
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
      />
      <NewDatasetButton projectId={props.projectId} className="mt-4" />
    </div>
  );
}
