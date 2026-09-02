import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { BatchActionStatus } from "@langfuse/shared";

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
    createTextTableColumn<BatchActionRow>({
      accessorKey: "actionType",
      header: "Action Type",
      size: 200,
      mapValue: (value) =>
        value
          ?.split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
    }),
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
    createStatusTableColumn<BatchActionRow, string>({
      accessorKey: "status",
      getStatus: (status) => {
        if (status === BatchActionStatus.Queued) return "queued";
        if (status === BatchActionStatus.Processing) return "processing";
        if (status === BatchActionStatus.Completed) return "completed";
        if (status === BatchActionStatus.Failed) return "failed";
        if (status === BatchActionStatus.Partial) return "partial";
        if (!status) return undefined;

        return status.toLowerCase();
      },
      header: "Status",
      size: 110,
    }),
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
              <div className="text-destructive text-xs">
                {failedCount} failed
              </div>
            )}
          </div>
        );
      },
    },
    createDateTableColumn<BatchActionRow>({
      accessorKey: "createdAt",
      header: "Created",
      size: 150,
    }),
    createDateTableColumn<BatchActionRow>({
      accessorKey: "finishedAt",
      header: "Finished",
      size: 150,
    }),
    createUserTableColumn<BatchActionRow>({
      accessorKey: "user",
      header: "Created By",
      size: 150,
      variant: "avatar",
      emptyValue: "Unknown",
    }),
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
                  <InfoIcon className="text-muted-foreground h-3 w-3" />
                  <span className="max-w-[250px] truncate text-xs" title={log}>
                    {log}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <pre className="max-h-60 overflow-auto text-xs whitespace-pre-wrap">
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
      tableName="batchActions"
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
      cellPadding="comfortable"
    />
  );
}
