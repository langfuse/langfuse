import React from "react";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { ActionExecutionStatus } from "@langfuse/shared";
import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useFormatter, useTranslations } from "next-intl";

const actionExecutionStatusToStatus = {
  [ActionExecutionStatus.COMPLETED]: "completed",
  [ActionExecutionStatus.ERROR]: "error",
  [ActionExecutionStatus.PENDING]: "pending",
  [ActionExecutionStatus.CANCELLED]: "cancelled",
} satisfies Record<ActionExecutionStatus, Status>;

type ActionExecutionRow = {
  id: string;
  status: ActionExecutionStatus;
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
  automationId: string;
}

export const AutomationExecutionsTable: React.FC<
  AutomationExecutionsTableProps
> = ({ projectId, automationId }) => {
  const t = useTranslations("remainderUi.automations.executions");
  const format = useFormatter();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "automation-executions",
    "s",
  );

  const { data, isLoading, isError, error } =
    api.automations.getAutomationExecutions.useQuery(
      {
        projectId,
        automationId,
        page: paginationState.pageIndex,
        limit: paginationState.pageSize,
      },
      // Suppress 404 toast: invalidation after deletion can refetch this query
      // before the component unmounts.
      { meta: { silentHttpCodes: [404] } },
    );

  const columns: LangfuseColumnDef<ActionExecutionRow>[] = [
    createStatusTableColumn<ActionExecutionRow, ActionExecutionStatus>({
      accessorKey: "status",
      header: t("status"),
      getStatus: (status) =>
        status ? actionExecutionStatusToStatus[status] : undefined,
    }),
    {
      accessorKey: "startedAt",
      header: t("started"),
      id: "startedAt",
      cell: ({ row }) => {
        const value = row.getValue("startedAt") as string | null;
        if (!value) return <span className="text-muted-foreground">-</span>;
        const date = new Date(value);
        return (
          <div className="flex flex-col">
            <span className="text-xs">{format.relativeTime(date)}</span>
            <span className="text-muted-foreground text-xs">
              {format.dateTime(date, {
                dateStyle: "medium",
                timeStyle: "medium",
              })}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "duration",
      header: t("duration"),
      id: "duration",
      cell: ({ row }) => {
        const duration = row.getValue("duration") as number | null;
        if (!duration) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="text-nowrap">{formatIntervalSeconds(duration)}</span>
        );
      },
    },
    createIOTableColumn<ActionExecutionRow>({
      accessorKey: "input",
      header: t("input"),
    }),
    createIOTableColumn<ActionExecutionRow>({
      accessorKey: "output",
      header: t("output"),
      getCell: (value) => value || "-",
      variant: "output",
    }),
    {
      accessorKey: "error",
      header: t("error"),
      id: "error",
      size: 150,
      cell: ({ row }) => {
        const value = row.getValue("error") as string | null;
        if (!value) return <span className="text-muted-foreground">-</span>;
        return value;
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

  if (isError) {
    return (
      <div className="py-4 text-center text-red-600">
        {t("loadError", { message: error?.message ?? t("error") })}
      </div>
    );
  }

  return (
    <>
      <DataTableToolbar
        columns={columns}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
      />
      <DataTable
        tableName="automationExecutions"
        columns={columns}
        data={{
          isLoading,
          isError,
          data: rows,
        }}
        pagination={{
          totalCount: data?.totalCount ?? 0,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
      />
    </>
  );
};
