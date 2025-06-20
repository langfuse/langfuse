import React from "react";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { formatDistanceToNow } from "date-fns";
import TableLink from "@/src/components/table/table-link";
import { type TriggerEventSource } from "@langfuse/shared";
import { formatIntervalSeconds } from "@/src/utils/dates";

type ActionExecutionRow = {
  id: string;
  status: string;
  sourceId: string;
  input: any;
  output: any;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  duration: number | null;
};

interface AutomationExecutionsTableProps {
  projectId: string;
  triggerId: string;
  actionId: string;
  eventSource: TriggerEventSource;
}

export const AutomationExecutionsTable: React.FC<
  AutomationExecutionsTableProps
> = ({ projectId, triggerId, actionId, eventSource }) => {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const { data, isLoading, isError, error } =
    api.automations.getAutomationExecutions.useQuery({
      projectId,
      triggerId,
      actionId,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    });

  const columns: LangfuseColumnDef<ActionExecutionRow>[] = [
    {
      accessorKey: "status",
      header: "Status",
      id: "status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return <StatusBadge type={status.toLowerCase()} />;
      },
    },
    {
      accessorKey: "sourceId",
      header: eventSource === "prompt" ? "Prompt ID" : "Source ID",
      id: "sourceId",
      cell: ({ row }) => {
        const value = row.getValue("sourceId") as string;
        return (
          <span className="font-mono text-xs">
            {eventSource === "prompt" ? (
              <TableLink
                path={`/project/${projectId}/prompts/${value}`}
                value={value}
              />
            ) : (
              value
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "startedAt",
      header: "Started",
      id: "startedAt",
      cell: ({ row }) => {
        const value = row.getValue("startedAt") as string | null;
        if (!value) return <span className="text-muted-foreground">-</span>;
        const date = new Date(value);
        return (
          <div className="flex flex-col">
            <span className="text-xs">
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
            <span className="text-xs text-muted-foreground">
              {date.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "duration",
      header: "Duration",
      id: "duration",
      cell: ({ row }) => {
        const duration = row.getValue("duration") as number | null;
        if (!duration) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="text-nowrap">{formatIntervalSeconds(duration)}</span>
        );
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      cell: ({ row }) => {
        const value = row.getValue("input");
        return <IOTableCell data={value} singleLine={true} />;
      },
    },
    {
      accessorKey: "output",
      header: "Output",
      id: "output",
      cell: ({ row }) => {
        const value = row.getValue("output");
        if (!value) return <span className="text-muted-foreground">-</span>;
        return <IOTableCell data={value} singleLine={true} />;
      },
    },
    {
      accessorKey: "error",
      header: "Error",
      id: "error",
      cell: ({ row }) => {
        const value = row.getValue("error") as string | null;
        if (!value) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="max-w-xs">
            <span className="break-words text-xs text-red-600">{value}</span>
          </div>
        );
      },
    },
  ];

  const rows: ActionExecutionRow[] = React.useMemo(() => {
    return (
      data?.executions.map((execution) => ({
        id: execution.id,
        status: execution.status,
        sourceId: execution.sourceId,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        createdAt: execution.createdAt.toISOString(),
        startedAt: execution.startedAt?.toISOString() || null,
        duration: execution.finishedAt
          ? (execution.finishedAt.getTime() -
              (execution.startedAt?.getTime() ?? 0)) /
            1000
          : null,
      })) || []
    );
  }, [data]);

  if (isLoading) {
    return <div className="py-4 text-center">Loading execution history...</div>;
  }

  if (isError) {
    return (
      <div className="py-4 text-center text-red-600">
        Error loading execution history: {error?.message}
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={{
        isLoading,
        isError,
        data: rows,
      }}
      pagination={{
        totalCount: data.totalCount,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
};
