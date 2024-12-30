import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
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

export function BatchExportsTable(props: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const batchExports = api.batchExport.all.useQuery({
    projectId: props.projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
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
  ] as LangfuseColumnDef<BatchExport>[];

  return (
    <>
      <DataTable
        columns={columns}
        data={
          batchExports.isLoading
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
                  data: batchExports.data.exports,
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
