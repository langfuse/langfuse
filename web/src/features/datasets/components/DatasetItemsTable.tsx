import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

import { Archive, MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { DatasetStatus, type DatasetItem } from "@langfuse/shared/src/db";
import { cn } from "@/src/utils/tailwind";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEffect } from "react";

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
  const { setDetailPageList } = useDetailPageLists();
  const utils = api.useUtils();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId,
    datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  useEffect(() => {
    if (items.isSuccess) {
      setDetailPageList(
        "datasetItems",
        items.data.datasetItems.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.isSuccess, items.data]);

  const mutUpdate = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
  });

  const columns: LangfuseColumnDef<RowData>[] = [
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
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const id: string = row.getValue("id");
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
                  mutUpdate.mutate({
                    projectId: projectId,
                    datasetId: datasetId,
                    datasetItemId: id,
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
    item: RouterOutput["datasets"]["itemsByDatasetId"]["datasetItems"][number],
  ): RowData => {
    let input = item.input ? JSON.stringify(item.input) : "";
    input = input.length > 50 ? input.slice(0, 50) + "..." : input;
    let expectedOutput = item.expectedOutput
      ? JSON.stringify(item.expectedOutput)
      : "";
    expectedOutput =
      expectedOutput.length > 50
        ? expectedOutput.slice(0, 50) + "..."
        : expectedOutput;

    return {
      id: item.id,
      status: item.status,
      createdAt: item.createdAt.toLocaleString(),
      input,
      expectedOutput,
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
                  data: items.data.datasetItems.map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          pageCount: Math.ceil(
            (items.data?.totalDatasetItems ?? 0) / paginationState.pageSize,
          ),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
