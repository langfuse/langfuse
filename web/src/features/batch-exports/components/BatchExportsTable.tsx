import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api, type RouterOutputs } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
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

type BatchExportRow = RouterOutputs["batchExport"]["all"]["exports"][number];

export function BatchExportsTable(props: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedExportId, setSelectedExportId] = useState<string | null>(null);
  // Per-row pending downloads: a shared mutation with a single scalar id
  // would cross-wire spinners when two rows are clicked in quick succession.
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const batchExports = api.batchExport.all.useQuery({
    projectId: props.projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
  });

  const cancelBatchExport = api.batchExport.cancel.useMutation({
    onSuccess: () => {
      batchExports.refetch();
      setCancelDialogOpen(false);
      setSelectedExportId(null);
    },
  });

  const downloadBatchExport = api.batchExport.downloadUrl.useMutation();

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
        const { createdAt, finishedAt, expiresAt } = row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="whitespace-break-spaces">{name}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="text-muted-foreground size-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <div>Created: {new Date(createdAt).toLocaleString()}</div>
                    <div>
                      Finished:{" "}
                      {finishedAt ? new Date(finishedAt).toLocaleString() : "-"}
                    </div>
                    <div>
                      Download expires:{" "}
                      {expiresAt ? new Date(expiresAt).toLocaleString() : "-"}
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
      cell: ({ row }) => {
        const { status, log } = row.original;
        const badge = <StatusBadge type={status.toLowerCase()} />;
        // The log only exists on failed exports (worker-written, user-facing
        // error message); surface it on the badge instead of a dedicated
        // column that is empty for every successful row.
        if (!log) {
          return badge;
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>{badge}</TooltipTrigger>
              <TooltipContent className="max-w-md whitespace-pre-wrap">
                {log}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: "isDownloadable",
      id: "action",
      header: "Action",
      size: 130,
      // One state-dependent action per row: Cancel while queued/processing,
      // Download (or Expired) once completed — the states never coexist.
      cell: ({ row }) => {
        const { id, status, isExpired, isDownloadable } = row.original;
        if (isDownloadable) {
          return (
            <ActionButton
              icon={<DownloadIcon size={16} />}
              size="sm"
              loading={downloadingIds.has(id)}
              onClick={() => {
                setDownloadingIds((prev) => new Set(prev).add(id));
                downloadBatchExport.mutate(
                  { projectId: props.projectId, batchExportId: id },
                  {
                    // Content-Disposition is `attachment`, so assigning the
                    // fresh URL triggers a download without leaving the page.
                    onSuccess: (data) => {
                      window.location.href = data.url;
                    },
                    onSettled: () =>
                      setDownloadingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      }),
                  },
                );
              }}
            >
              Download
            </ActionButton>
          );
        }
        if (status === "COMPLETED" && isExpired) {
          return <span className="text-muted-foreground">Expired</span>;
        }
        if (status === "QUEUED" || status === "PROCESSING") {
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
                    Are you sure you want to cancel this batch export? This
                    action cannot be undone.
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
        }
        return null;
      },
    },
    {
      accessorKey: "expiresAt",
      id: "expiresAt",
      header: "Expires",
      size: 130,
      cell: ({ row }) => {
        const { status, expiresAt, isExpired } = row.original;
        if (status !== "COMPLETED" || !expiresAt) {
          return null;
        }
        return (
          <span
            className={isExpired ? "text-muted-foreground" : undefined}
            title={new Date(expiresAt).toLocaleString()}
          >
            {formatDistanceToNow(new Date(expiresAt), { addSuffix: true })}
          </span>
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
  ] as LangfuseColumnDef<BatchExportRow>[];

  return (
    <>
      <DataTable
        tableName="batchExports"
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
        cellPadding="comfortable"
      />
    </>
  );
}
