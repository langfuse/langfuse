import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type Score } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type JobExecutionRow = {
  status: string;
  scoreResult?: Score;
  startTime?: string;
  endTime?: string;
  traceId?: string;
  templateId: string;
  configId: string;
  error?: string;
};

export default function EvalLogTable({ projectId }: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const logs = api.evals.getLogs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
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
    }),
    columnHelper.accessor("endTime", {
      id: "endTime",
      header: "End Time",
    }),
    columnHelper.accessor("scoreResult", {
      id: "score",
      header: "Score",
      cell: (row) => {
        const score = row.getValue();

        return (
          <GroupedScoreBadges
            scores={score ? [score] : []}
            variant="headings"
          />
        );
      },
    }),
    columnHelper.accessor("error", {
      id: "error",
      header: "Error",
      cell: (row) => {
        const error = row.getValue();
        // const values: Score[] = row.getValue("scores");
        return error;
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
    }),
  ] as LangfuseColumnDef<JobExecutionRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<JobExecutionRow>("evalConfigColumnVisibility", columns);

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["getLogs"]["data"][number],
  ): JobExecutionRow => {
    return {
      status: jobConfig.status,
      scoreResult: jobConfig.score ?? undefined,
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
