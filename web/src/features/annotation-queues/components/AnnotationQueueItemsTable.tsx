import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type AnnotationQueueStatus } from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { ChevronDown, ListTree, Trash } from "lucide-react";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { type RouterOutput } from "@/src/utils/types";
import { type RowSelectionState } from "@tanstack/react-table";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Checkbox } from "@/src/components/ui/checkbox";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import TableIdOrName from "@/src/components/table/table-id";

const QueueItemTableMultiSelectAction = ({
  selectedItemIds,
  projectId,
  onDeleteSuccess,
}: {
  selectedItemIds: string[];
  projectId: string;
  onDeleteSuccess: () => void;
}) => {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  const hasDeleteAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const mutDeleteItems = api.annotationQueueItems.deleteMany.useMutation({
    onSuccess: () => {
      onDeleteSuccess();
      void utils.annotationQueueItems.itemsByQueueId.invalidate();
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={selectedItemIds.length < 1}>
            Actions ({selectedItemIds.length} selected)
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={!hasDeleteAccess}
            onClick={() => {
              setOpen(true);
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete queue items</DialogTitle>
            <DialogDescription>
              This action cannot be undone and removes the selected annotation
              queue item(s), but
              <strong> does not delete associated scores.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              loading={mutDeleteItems.isPending}
              disabled={mutDeleteItems.isPending}
              onClick={() => {
                void mutDeleteItems
                  .mutateAsync({
                    itemIds: selectedItemIds,
                    projectId,
                  })
                  .then(() => {
                    setOpen(false);
                  });
              }}
            >
              Delete {selectedItemIds.length} item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export type QueueItemRowData = {
  id: string;
  sourceId: string;
  status: AnnotationQueueStatus;
  completedAt: string;
  annotatorUser: {
    userId?: string;
    userName?: string;
    image?: string;
  };
} & (
  | {
      objectType: "OBSERVATION";
      source: {
        traceId: string;
        observationId: string;
      };
    }
  | {
      objectType: "TRACE";
      source: {
        traceId: string;
      };
    }
  | {
      objectType: "SESSION";
      source: {
        sessionId: string;
      };
    }
);

export function AnnotationQueueItemsTable({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("queueItems", "s");
  const items = api.annotationQueueItems.itemsByQueueId.useQuery({
    projectId,
    queueId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const columns: LangfuseColumnDef<QueueItemRowData>[] = [
    {
      id: "select",
      accessorKey: "select",
      size: 30,
      isPinnedLeft: true,
      isFixedPosition: true,
      header: ({ table }) => {
        return (
          <div className="flex h-full items-center">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected()
                  ? true
                  : table.getIsSomePageRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(value) => {
                table.toggleAllPageRowsSelected(!!value);
                if (!value) {
                  setSelectedRows({});
                }
              }}
              aria-label="Select all"
              className="opacity-60"
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="mt-1 opacity-60 data-[state=checked]:mt-[5px]"
          />
        );
      },
    },
    {
      accessorKey: "id",
      header: "Id",
      id: "id",
      size: 70,
      isFixedPosition: true,
      cell: ({ row }) => {
        const id: QueueItemRowData["id"] = row.getValue("id");
        return (
          <TableLink
            path={`/project/${projectId}/annotation-queues/${queueId}/items/${id}?singleItem=true`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "objectType",
      header: "Type",
      id: "objectType",
      size: 50,
      cell: ({ row }) => {
        const objectType: QueueItemRowData["objectType"] =
          row.getValue("objectType");
        return <span className="capitalize">{objectType.toLowerCase()}</span>;
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      headerTooltip: {
        description:
          "Link to the source trace, observation or session based on which this item was added",
      },
      id: "source",
      size: 50,
      cell: ({ row }) => {
        const rowData = row.original;
        if (!rowData.source) return null;

        switch (rowData.objectType) {
          case "OBSERVATION":
            return (
              <TableLink
                path={`/project/${projectId}/traces/${rowData.source.traceId}?observation=${rowData.source.observationId}`}
                value={`Observation: ${rowData.source.observationId}`}
                icon={<ListTree className="h-4 w-4" />}
              />
            );
          case "TRACE":
            return (
              <TableLink
                path={`/project/${projectId}/traces/${rowData.source.traceId}`}
                value={`Trace: ${rowData.source.traceId}`}
                icon={<ListTree className="h-4 w-4" />}
              />
            );
          case "SESSION":
            return (
              <TableLink
                path={`/project/${projectId}/sessions/${rowData.source.sessionId}`}
                value={`Session: ${rowData.source.sessionId}`}
                icon={<ListTree className="h-4 w-4" />}
              />
            );
          default:
            throw new Error(`Unknown object type`);
        }
      },
    },
    {
      accessorKey: "sourceId",
      header: "Source ID",
      id: "sourceId",
      size: 50,
      cell: ({ row }) => {
        const sourceId: QueueItemRowData["sourceId"] = row.getValue("sourceId");
        return <TableIdOrName value={sourceId} />;
      },
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "status",
      header: "Status",
      id: "status",
      size: 60,
      cell: ({ row }) => {
        const status: QueueItemRowData["status"] = row.getValue("status");
        return (
          <StatusBadge
            className="capitalize"
            type={status.toLowerCase()}
            isLive={false}
          />
        );
      },
    },
    {
      accessorKey: "completedAt",
      header: "Completed At",
      id: "completedAt",
      defaultHidden: true,
      enableHiding: true,
      size: 60,
    },
    {
      accessorKey: "annotatorUser",
      header: "Completed by",
      id: "annotatorUser",
      enableHiding: true,
      size: 80,
      cell: ({ row }) => {
        const annotatorUser: QueueItemRowData["annotatorUser"] =
          row.getValue("annotatorUser");
        if (!annotatorUser || !annotatorUser.userId) return null;

        const { userId, userName, image } = annotatorUser;
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={userName ?? "User Avatar"}
              />
              <AvatarFallback>
                {userName
                  ? userName
                      .split(" ")
                      .map((word) => word[0])
                      .slice(0, 2)
                      .concat("")
                  : null}
              </AvatarFallback>
            </Avatar>
            <span>{userName ?? userId}</span>
          </div>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["annotationQueueItems"]["itemsByQueueId"]["queueItems"][number],
  ): QueueItemRowData => {
    const baseData = {
      id: item.id,
      completedAt: item.completedAt?.toLocaleString() ?? "",
      status: item.status,
      annotatorUser: {
        userId: item.annotatorUserId ?? undefined,
        userName: item.annotatorUserName ?? undefined,
        image: item.annotatorUserImage ?? undefined,
      },
      sourceId: item.objectId,
    };

    switch (item.objectType) {
      case "OBSERVATION":
        return {
          ...baseData,
          objectType: "OBSERVATION" as const,
          source: {
            traceId: item.parentTraceId ?? "",
            observationId: item.objectId,
          },
        };
      case "TRACE":
        return {
          ...baseData,
          objectType: "TRACE" as const,
          source: {
            traceId: item.objectId,
          },
        };
      case "SESSION":
        return {
          ...baseData,
          objectType: "SESSION" as const,
          source: {
            sessionId: item.objectId,
          },
        };
      default:
        throw new Error(`Unknown object type: ${item.objectType}`);
    }
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<QueueItemRowData>(
      `queueItemsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<QueueItemRowData>(
    "queueItemsColumnOrder",
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
        actionButtons={[
          Object.keys(selectedRows).filter((itemId) =>
            items.data?.queueItems.map((item) => item.id).includes(itemId),
          ).length > 0 ? (
            <QueueItemTableMultiSelectAction
              // Exclude items that are not in the current page
              selectedItemIds={Object.keys(selectedRows).filter((itemId) =>
                items.data?.queueItems.map((item) => item.id).includes(itemId),
              )}
              projectId={projectId}
              onDeleteSuccess={() => {
                setSelectedRows({});
              }}
            />
          ) : null,
        ]}
      />
      <DataTable
        tableName={"annotationQueueItems"}
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
                  data: safeExtract(items.data, "queueItems", []).map((item) =>
                    convertToTableRow(item),
                  ),
                }
        }
        help={{
          description:
            "Add traces and/or observations to your annotation queue to have them annotated by your team across predefined dimensions.",
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
        }}
        pagination={{
          totalCount: items.data?.totalItems ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowSelection={selectedRows}
        setRowSelection={setSelectedRows}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
