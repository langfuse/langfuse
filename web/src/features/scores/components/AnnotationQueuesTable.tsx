import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { CreateAnnotationQueueButton } from "@/src/features/scores/components/CreateAnnotationQueueButton";
import { type ScoreDataType } from "@langfuse/shared";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { DeleteAnnotationQueueButton } from "@/src/features/scores/components/DeleteAnnotationQueueButton";
import { cn } from "@/src/utils/tailwind";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  description?: string;
  countCompletedItems: number;
  countPendingItems: number;
  scoreConfigs: { id: string; name: string; dataType: ScoreDataType }[];
  createdAt: string;
};

export function AnnotationQueuesTable({ projectId }: { projectId: string }) {
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "annotationQueues",
    "s",
  );

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const queues = api.annotationQueues.all.useQuery({
    projectId: projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      // TODO: make this a link to the queue
      accessorKey: "key",
      header: "Name",
      id: "key",
      size: 150,
      isPinned: true,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return <span>{key.name}</span>;
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      id: "description",
      enableHiding: true,
      size: 200,
      cell: ({ row }) => {
        const description: RowData["description"] = row.getValue("description");
        return (
          <span
            className={cn(
              "grid h-full items-center overflow-auto",
              rowHeight === "s" && "leading-3",
            )}
          >
            {description}
          </span>
        );
      },
    },
    {
      accessorKey: "countCompletedItems",
      header: "Completed Items",
      id: "countCompletedItems",
      enableHiding: true,
      size: 90,
    },
    {
      accessorKey: "countPendingItems",
      header: "Pending Items",
      id: "countPendingItems",
      enableHiding: true,
      size: 90,
    },
    {
      accessorKey: "scoreConfigs",
      header: "Score Configs",
      id: "scoreConfigs",
      enableHiding: true,
      size: 200,
      cell: ({ row }) => {
        const scoreConfigs: RowData["scoreConfigs"] =
          row.getValue("scoreConfigs");

        return (
          <span
            className={cn(
              "grid h-full items-center overflow-auto",
              rowHeight === "s" && "leading-3",
            )}
          >
            {scoreConfigs
              .map(
                (config) =>
                  `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
              )
              .join(", ")}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      enableHiding: true,
      size: 150,
    },
    {
      accessorKey: "actions",
      header: "Actions",
      id: "actions",
      size: 70,
      isPinned: true,
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
              <DeleteAnnotationQueueButton
                projectId={projectId}
                queueId={key.id}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["annotationQueues"]["all"]["queues"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      description: item.description ?? undefined,
      scoreConfigs: item.scoreConfigs,
      createdAt: item.createdAt.toLocaleString(),
      countCompletedItems: item.countCompletedItems,
      countPendingItems: item.countPendingItems,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "queuesColumnVisibility",
    columns,
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<RowData>(
    "queuesColumnOrder",
    columns,
  );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={<CreateAnnotationQueueButton projectId={projectId} />}
      />
      <DataTable
        columns={columns}
        data={
          queues.isLoading
            ? { isLoading: true, isError: false }
            : queues.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: queues.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: queues.data.queues.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          totalCount: queues.data?.totalCount ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
