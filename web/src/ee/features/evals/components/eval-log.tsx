import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type JobExecutionRow = {
  status: string;
  scoreName?: string;
  scoreValue?: number;
  scoreComment?: string;
  startTime?: string;
  endTime?: string;
  traceId?: string;
  templateId: string;
  configId: string;
  error?: string;
};


export default function EvalLogTable({
  projectId,
  jobConfigurationId,
}: {
  projectId: string;
  jobConfigurationId?: string;
}) {
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("evalLogs", "s");
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const logs = api.evals.getLogs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    jobConfigurationId,
    projectId,
  });
  const totalCount = logs.data?.totalCount ?? 0;

  const columnHelper = createColumnHelper<JobExecutionRow>();
  const columns = [
    columnHelper.accessor("status", {
      header: "Status",
      id: "status",
      cell: (row) => {
        const status = row.getValue();
        return <StatusBadge type={status.toLowerCase()} />;
      },
    }),
    columnHelper.accessor("startTime", {
      id: "startTime",
      header: "Start Time",
      enableHiding: true,
    }),
    columnHelper.accessor("endTime", {
      id: "endTime",
      header: "End Time",
      enableHiding: true,
    }),
    columnHelper.accessor("scoreName", {
      header: "Score Name",
      id: "scoreName",
      enableHiding: true,
    }),
    columnHelper.accessor("scoreValue", {
      header: "Score Value",
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
      header: "Score Comment",
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
      header: "Error",
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
      header: "Trace",
      cell: (row) => {
        const traceId = row.getValue();
        return traceId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}`}
            value={traceId}
            truncateAt={10}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("templateId", {
      id: "templateId",
      header: "Template",
      cell: (row) => {
        const templateId = row.getValue();
        return templateId ? (
          <TableLink
            path={`/project/${projectId}/evals/templates/${encodeURIComponent(templateId)}`}
            value={templateId}
            truncateAt={10}
          />
        ) : undefined;
      },
    }),
  ] as LangfuseColumnDef<JobExecutionRow>[];

  if (!jobConfigurationId) {
    columns.push(
      columnHelper.accessor("configId", {
        id: "configId",
        header: "Config",
        cell: (row) => {
          const configId = row.getValue();
          return configId ? (
            <TableLink
              path={`/project/${projectId}/evals/configs/${encodeURIComponent(configId)}`}
              value={configId}
              truncateAt={10}
            />
          ) : undefined;
        },
      }) as LangfuseColumnDef<JobExecutionRow>,
    );
  }

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<JobExecutionRow>("evalLogColumnVisibility", columns);

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["getLogs"]["data"][number],
  ): JobExecutionRow => {
    return {
      status: jobConfig.status,
      scoreName: jobConfig.score?.name ?? undefined,
      scoreValue: jobConfig.score?.value ?? undefined,
      scoreComment: jobConfig.score?.comment ?? undefined,
      startTime: jobConfig.startTime?.toLocaleString() ?? undefined,
      endTime: jobConfig.endTime?.toLocaleString() ?? undefined,
      traceId: jobConfig.jobInputTraceId ?? undefined,
      templateId: jobConfig.jobConfiguration.evalTemplateId ?? "",
      configId: jobConfig.jobConfigurationId,
      error: jobConfig.error ?? undefined,
    };
  };

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
      />
      <DataTable
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
                  data: logs.data.data.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
}
