import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";
import { type RouterOutputs, api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { type Prisma } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { useTranslation } from "react-i18next";

export type JobExecutionRow = {
  status: string;
  scoreName?: string;
  scoreValue?: number;
  scoreComment?: string;
  scoreMetadata?: Prisma.JsonValue;
  startTime?: string;
  endTime?: string;
  traceId?: string;
  templateId: string;
  evaluatorId: string;
  error?: string;
};

export default function EvalLogTable({
  projectId,
  jobConfigurationId,
}: {
  projectId: string;
  jobConfigurationId?: string;
}) {
  const { t } = useTranslation();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("evalLogs", "s");
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [filterState, setFilterState] = useQueryFilterState(
    [],
    "job_executions",
    projectId,
  );

  const logs = api.evals.getLogs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    filter: filterState,
    jobConfigurationId,
    projectId,
  });
  const totalCount = logs.data?.totalCount ?? null;

  const columnHelper = createColumnHelper<JobExecutionRow>();
  const columns = [
    columnHelper.accessor("status", {
      header: t("common.batchExports.status"),
      id: "status",
      cell: (row) => {
        const status = row.getValue();
        return <StatusBadge type={status.toLowerCase()} />;
      },
    }),
    columnHelper.accessor("startTime", {
      id: "startTime",
      header: t("evaluation.eval.logTable.startTime"),
      enableHiding: true,
    }),
    columnHelper.accessor("endTime", {
      id: "endTime",
      header: t("evaluation.eval.logTable.endTime"),
      enableHiding: true,
    }),
    columnHelper.accessor("scoreName", {
      header: t("evaluation.eval.logTable.scoreName"),
      id: "scoreName",
      enableHiding: true,
    }),
    columnHelper.accessor("scoreValue", {
      header: t("evaluation.eval.logTable.scoreValue"),
      id: "scoreValue",
      enableHiding: true,
      cell: (row) => {
        const value = row.getValue();
        if (value === undefined) {
          return undefined;
        }
        return value % 1 === 0 ? value : value.toFixed(4);
      },
    }),
    columnHelper.accessor("scoreComment", {
      header: t("evaluation.eval.logTable.scoreComment"),
      id: "scoreComment",
      enableHiding: true,
      cell: (row) => {
        const value = row.getValue();
        return (
          value !== undefined && (
            <IOTableCell data={value} singleLine={rowHeight === "s"} />
          )
        );
      },
    }),
    columnHelper.accessor("error", {
      id: "error",
      header: t("common.errors.error"),
      enableHiding: true,
      cell: (row) => {
        const value = row.getValue();
        return (
          value !== undefined && (
            <IOTableCell data={value} singleLine={rowHeight === "s"} />
          )
        );
      },
    }),
    columnHelper.accessor("traceId", {
      id: "traceId",
      header: t("evaluation.eval.logTable.trace"),
      cell: (row) => {
        const traceId = row.getValue();
        return traceId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}`}
            value={traceId}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("templateId", {
      id: "templateId",
      header: t("evaluation.eval.logTable.template"),
      cell: (row) => {
        const templateId = row.getValue();
        return templateId ? (
          <TableLink
            path={`/project/${projectId}/evals/templates/${encodeURIComponent(templateId)}`}
            value={templateId}
          />
        ) : undefined;
      },
    }),
  ] as LangfuseColumnDef<JobExecutionRow>[];

  if (!jobConfigurationId) {
    columns.push(
      columnHelper.accessor("evaluatorId", {
        id: "evaluatorId",
        header: t("evaluation.eval.logTable.evaluator"),
        cell: (row) => {
          const evaluatorId = row.getValue();
          return evaluatorId ? (
            <TableLink
              path={`/project/${projectId}/evals/${encodeURIComponent(evaluatorId)}`}
              value={evaluatorId}
            />
          ) : undefined;
        },
      }) as LangfuseColumnDef<JobExecutionRow>,
    );
  }

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<JobExecutionRow>("evalLogColumnVisibility", columns);

  const [columnOrder, setColumnOrder] = useColumnOrder<JobExecutionRow>(
    "evalLogColumnOrder",
    columns,
  );

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["getLogs"]["data"][number],
  ): JobExecutionRow => {
    return {
      status: jobConfig.status,
      scoreName: jobConfig.score?.name ?? undefined,
      scoreValue: jobConfig.score?.value ?? undefined,
      scoreComment: jobConfig.score?.comment ?? undefined,
      scoreMetadata: jobConfig.score?.metadata ?? undefined,
      startTime: jobConfig.startTime?.toLocaleString() ?? undefined,
      endTime: jobConfig.endTime?.toLocaleString() ?? undefined,
      traceId: jobConfig.jobInputTraceId ?? undefined,
      templateId: jobConfig.jobTemplateId ?? "",
      evaluatorId: jobConfig.jobConfigurationId,
      error: jobConfig.error ?? undefined,
    };
  };

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
        filterState={filterState}
        setFilterState={setFilterState}
        filterColumnDefinition={evalExecutionsFilterCols}
      />
      <DataTable
        tableName={"evalLogs"}
        columns={columns}
        data={
          logs.isLoading
            ? { isLoading: true, isError: false }
            : logs.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: logs.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: safeExtract(logs.data, "data", []).map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
      />
    </>
  );
}
