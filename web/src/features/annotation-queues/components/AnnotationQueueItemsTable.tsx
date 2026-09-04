import { DataTable } from "@/src/components/table/data-table";
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
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { useHasProjectAccess } from "@/src/features/rbac";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";

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
      utils.annotationQueueItems.itemsByQueueId.invalidate();
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
                mutDeleteItems
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
              variant="muted"
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return (
          <span className="mt-1 inline-block has-data-[state=checked]:mt-[5px]">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              variant="muted"
            />
          </span>
        );
      },
    },
    createLinkTableColumn<QueueItemRowData>({
      accessorKey: "id",
      header: "Id",
      size: 70,
      isFixedPosition: true,
      getCell: (id) => {
        if (id) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/annotation-queues/${queueId}/items/${id}?singleItem=true`,
              value: id,
            },
          };
        }

        return undefined;
      },
    }),
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
    createLinkTableColumn<QueueItemRowData, QueueItemRowData["source"]>({
      accessorKey: "source",
      header: "Source",
      headerTooltip: {
        description:
          "Link to the source trace, observation or session based on which this item was added",
      },
      size: 50,
      getCell: (_, { row }) => {
        const rowData = row.original;
        if (!rowData.source) return undefined;

        if (rowData.objectType === "OBSERVATION") {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${rowData.source.traceId}?observation=${rowData.source.observationId}`,
              value: `Observation: ${rowData.source.observationId}`,
              icon: ListTree,
            },
          };
        }

        if (rowData.objectType === "TRACE") {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${rowData.source.traceId}`,
              value: `Trace: ${rowData.source.traceId}`,
              icon: ListTree,
            },
          };
        }

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/sessions/${rowData.source.sessionId}`,
            value: `Session: ${rowData.source.sessionId}`,
            icon: ListTree,
          },
        };
      },
    }),
    createIdTableColumn<QueueItemRowData>({
      accessorKey: "sourceId",
      header: "Source ID",
      size: 50,
      enableHiding: true,
      defaultHidden: true,
    }),
    createStatusTableColumn<QueueItemRowData, AnnotationQueueStatus>({
      accessorKey: "status",
      header: "Status",
      getStatus: (status) =>
        status
          ? (
              {
                PENDING: "pending",
                COMPLETED: "completed",
              } satisfies Record<AnnotationQueueStatus, Status>
            )[status]
          : undefined,
      size: 60,
      isLive: false,
    }),
    {
      accessorKey: "completedAt",
      header: "Completed At",
      id: "completedAt",
      defaultHidden: true,
      enableHiding: true,
      size: 60,
    },
    createUserTableColumn<QueueItemRowData, QueueItemRowData["annotatorUser"]>({
      accessorKey: "annotatorUser",
      header: "Completed by",
      enableHiding: true,
      size: 80,
      variant: "avatar",
      emptyValue: "",
      getUser: (annotatorUser) => {
        if (!annotatorUser || !annotatorUser.userId) return undefined;

        const { userId, userName, image } = annotatorUser;
        return {
          type: "user",
          user: { id: userId, name: userName, image },
        };
      },
    }),
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
        tableName="annotationQueueItems"
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
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
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
