import React from "react";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { formatDistanceToNow } from "date-fns";

type ActionExecutionRow = {
  id: string;
  status: string;
  sourceId: string;
  input: any;
  output: any;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

interface AutomationExecutionsTableProps {
  projectId: string;
  triggerId: string;
  actionId: string;
}

export const AutomationExecutionsTable: React.FC<
  AutomationExecutionsTableProps
> = ({ projectId, triggerId, actionId }) => {
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
      header: "Source ID",
      id: "sourceId",
      cell: ({ row }) => {
        const value = row.getValue("sourceId") as string;
        return (
          <span className="font-mono text-xs">
            {value.length > 8 ? `${value.slice(0, 8)}...` : value}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      cell: ({ row }) => {
        const value = row.getValue("createdAt") as string;
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
      accessorKey: "finishedAt",
      header: "Finished",
      id: "finishedAt",
      cell: ({ row }) => {
        const value = row.getValue("finishedAt") as string | null;
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
        finishedAt: execution.finishedAt?.toISOString() || null,
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

  if (!data || data.executions.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        No executions found for this automation.
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
