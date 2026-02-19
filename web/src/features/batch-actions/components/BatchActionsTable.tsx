import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { InfoIcon } from "lucide-react";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";

type BatchActionRow = {
  id: string;
  actionType: string;
  tableName: string;
  status: string;
  totalCount: number | null;
  processedCount: number | null;
  failedCount: number | null;
  createdAt: Date;
  finishedAt: Date | null;
  log: string | null;
  user: {
    name: string | null;
    image: string | null;
  } | null;
};

export function BatchActionsTable(props: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const batchActions = api.batchAction.all.useQuery({
    projectId: props.projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
  });

  const columns: LangfuseColumnDef<BatchActionRow>[] = [
    {
      accessorKey: "actionType",
      id: "actionType",
      header: "Action Type",
      size: 200,
      cell: ({ row }) => {
        const actionType = row.getValue("actionType") as string;
        const formattedType = actionType
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        return <span>{formattedType}</span>;
      },
    },
    {
      accessorKey: "tableName",
      id: "tableName",
      header: "Table",
      size: 120,
      cell: ({ row }) => {
        const tableName = row.getValue("tableName") as string;
        return <span className="capitalize">{tableName}</span>;
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 110,
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <StatusBadge type={status.toLowerCase()} className="capitalize" />
        );
      },
    },
    {
      accessorKey: "progress",
      id: "progress",
      header: "Progress",
      size: 150,
      cell: ({ row }) => {
        const totalCount = row.original.totalCount;
        const processedCount = row.original.processedCount ?? 0;
        const failedCount = row.original.failedCount ?? 0;

        if (!totalCount)
          return <span className="text-muted-foreground">-</span>;

        return (
          <div className="space-y-1">
            <div className="text-sm">
              {processedCount} / {totalCount}
            </div>
            {failedCount > 0 && (
              <div className="text-xs text-destructive">
                {failedCount} failed
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created",
      size: 150,
      cell: ({ row }) => {
        const createdAt = row.getValue("createdAt") as Date;
        return <LocalIsoDate date={createdAt} />;
      },
    },
    {
      accessorKey: "finishedAt",
      id: "finishedAt",
      header: "Finished",
      size: 150,
      cell: ({ row }) => {
        const finishedAt = row.getValue("finishedAt") as Date | null;
        return finishedAt ? (
          <LocalIsoDate date={finishedAt} />
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
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
      cell: ({ row }) => {
        const log = row.getValue("log") as string | null;
        return log ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1">
                  <InfoIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[250px] truncate text-xs">{log}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">
                  {log}
                </pre>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null;
      },
    },
  ];

  return (
    <DataTable
      tableName={"batchActions"}
      columns={columns}
      data={
        batchActions.isPending
          ? { isLoading: true, isError: false }
          : batchActions.isError
            ? {
                isLoading: false,
                isError: true,
                error: batchActions.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: safeExtract(batchActions.data, "batchActions", []),
              }
      }
      pagination={{
        totalCount: batchActions.data?.totalCount ?? 0,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}
