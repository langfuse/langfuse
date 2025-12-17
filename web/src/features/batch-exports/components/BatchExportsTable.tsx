import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { type BatchExport } from "@langfuse/shared";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { ActionButton } from "@/src/components/ActionButton";
import { DownloadIcon, InfoIcon } from "lucide-react";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/src/components/ui/alert-dialog";
import { useState } from "react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function BatchExportsTable(props: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedExportId, setSelectedExportId] = useState<string | null>(null);

  const batchExports = api.batchExport.all.useQuery({
    projectId: props.projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
  });

  const cancelBatchExport = api.batchExport.cancel.useMutation({
    onSuccess: () => {
      void batchExports.refetch();
      setCancelDialogOpen(false);
      setSelectedExportId(null);
    },
  });

  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "batchExports:create",
  });

  const columns = [
    {
      accessorKey: "name",
      id: "name",
      header: "Name",
      size: 200,
      cell: ({ row }) => {
        const name = row.getValue("name") as string;
        const { createdAt, finishedAt } = row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="whitespace-break-spaces">{name}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="size-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <div>Created: {new Date(createdAt).toLocaleString()}</div>
                    <div>
                      Finished:{" "}
                      {finishedAt ? new Date(finishedAt).toLocaleString() : "-"}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 90,
      cell: (row) => {
        const status = row.getValue() as string;
        return (
          <StatusBadge type={status.toLowerCase()} className="capitalize" />
        );
      },
    },
    {
      accessorKey: "url",
      id: "url",
      header: "Download URL",
      size: 130,
      cell: (info) => {
        const url = info.getValue() as string | null;
        if (!url) {
          return null;
        }
        if (url === "expired") {
          return <span className="text-muted-foreground">Expired</span>;
        }
        return (
          <ActionButton href={url} icon={<DownloadIcon size={16} />} size="sm">
            Download
          </ActionButton>
        );
      },
    },
    {
      accessorKey: "format",
      id: "format",
      header: "Format",
      size: 70,
    },
    {
      accessorKey: "user",
      id: "user",
      header: "Created By",
      size: 150,
      cell: ({ row }) => {
        const user = row.getValue("user") as {
          name: string | null;
          image: string | null;
        } | null;
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={user?.image ?? undefined}
                alt={user?.name ?? "User Avatar"}
              />
            </Avatar>
            <span>{user?.name ?? "Unknown"}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "log",
      id: "log",
      header: "Log",
      size: 300,
      cell: (row) => {
        const log = row.getValue() as string | null;
        return log ?? null;
      },
    },
    {
      accessorKey: "actions",
      id: "actions",
      header: "Actions",
      size: 100,
      cell: ({ row }) => {
        const id = row.original.id;
        const status = row.getValue("status") as string;

        // Only show cancel button for queued or processing exports
        if (status !== "QUEUED" && status !== "PROCESSING") {
          return null;
        }

        return (
          <AlertDialog
            open={cancelDialogOpen && selectedExportId === id}
            onOpenChange={(open) => {
              if (!open) {
                setCancelDialogOpen(false);
                setSelectedExportId(null);
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <ActionButton
                hasAccess={hasAccess}
                size="sm"
                onClick={() => {
                  setSelectedExportId(id);
                  setCancelDialogOpen(true);
                }}
              >
                Cancel
              </ActionButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel batch export?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel this batch export? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No, keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    cancelBatchExport.mutate({
                      projectId: props.projectId,
                      batchExportId: id,
                    });
                  }}
                >
                  Yes, cancel export
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      },
    },
  ] as LangfuseColumnDef<BatchExport>[];

  return (
    <>
      <DataTable
        tableName={"batchExports"}
        columns={columns}
        data={
          batchExports.isPending
            ? { isLoading: true, isError: false }
            : batchExports.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: batchExports.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: safeExtract(batchExports.data, "exports", []),
                }
        }
        pagination={{
          totalCount: batchExports.data?.totalCount ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </>
  );
}
