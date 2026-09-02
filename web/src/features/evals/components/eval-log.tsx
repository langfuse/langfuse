import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { DataTable } from "@/src/components/table/data-table";
import {
  type CustomHeights,
  useRowHeightLocalStorage,
} from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { evalLogFilterConfig } from "@/src/features/filters/config/eval-logs-config";
import { type RouterOutputs, api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { JobExecutionStatus, type Prisma } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";

const jobExecutionStatusToStatus = {
  [JobExecutionStatus.COMPLETED]: "completed",
  [JobExecutionStatus.ERROR]: "error",
  [JobExecutionStatus.PENDING]: "pending",
  [JobExecutionStatus.CANCELLED]: "cancelled",
  [JobExecutionStatus.DELAYED]: "delayed",
} satisfies Record<JobExecutionStatus, Status>;

export type JobExecutionRow = {
  status: JobExecutionStatus;
  scoreName?: string;
  scoreValue?: number | string;
  scoreComment?: string;
  scoreMetadata?: Prisma.JsonValue;
  startTime?: Date;
  endTime?: Date;
  traceId?: string;
  executionTraceId?: string;
  templateId: string;
  evaluatorId: string;
  error?: string;
};

const evalLogRowHeights: CustomHeights = {
  s: "h-8",
  m: "h-24",
  l: "h-64",
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

  const queryFilter = useSidebarFilterState(
    evalLogFilterConfig,
    {}, // No dynamic options needed - status options are in column definition
    {
      loading: false,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
    },
  );

  const logs = api.evals.getLogs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    filter: queryFilter.filterState,
    jobConfigurationId,
    projectId,
  });
  const totalCount = logs.data?.totalCount ?? null;

  const columnHelper = createColumnHelper<JobExecutionRow>();
  const columns = [
    createStatusTableColumn<JobExecutionRow, JobExecutionStatus>({
      accessorKey: "status",
      header: "Status",
      getStatus: (status) =>
        status ? jobExecutionStatusToStatus[status] : undefined,
    }),
    createDateTableColumn<JobExecutionRow>({
      accessorKey: "startTime",
      header: "Start Time",
      enableHiding: true,
    }),
    createDateTableColumn<JobExecutionRow>({
      accessorKey: "endTime",
      header: "End Time",
      enableHiding: true,
    }),
    createIdTableColumn<JobExecutionRow>({
      accessorKey: "scoreName",
      header: "Score Name",
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
        if (typeof value === "number") {
          return value % 1 === 0 ? value : value.toFixed(4);
        }
        return value;
      },
    }),
    createIOTableColumn<JobExecutionRow>({
      accessorKey: "scoreComment",
      header: "Score Comment",
      enableHiding: true,
      cellPadding: "none",
      compact: true,
      singleLine: rowHeight === "s",
    }),
    createIOTableColumn<JobExecutionRow>({
      accessorKey: "error",
      header: "Error",
      enableHiding: true,
      cellPadding: "none",
      compact: true,
      singleLine: rowHeight === "s",
    }),
    createLinkTableColumn<JobExecutionRow>({
      accessorKey: "traceId",
      header: "Target Trace",
      getCell: (traceId) => {
        if (traceId) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${encodeURIComponent(traceId)}`,
              value: traceId,
            },
          };
        }

        return undefined;
      },
    }),
    createLinkTableColumn<JobExecutionRow>({
      accessorKey: "executionTraceId",
      header: "Execution Trace",
      enableHiding: true,
      getCell: (traceId) => {
        if (traceId) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${encodeURIComponent(traceId)}`,
              value: traceId,
            },
          };
        }

        return undefined;
      },
    }),
    createLinkTableColumn<JobExecutionRow>({
      accessorKey: "templateId",
      header: "Template",
      getCell: (templateId) => {
        if (templateId) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/evals/templates/${encodeURIComponent(templateId)}`,
              value: templateId,
            },
          };
        }

        return undefined;
      },
    }),
  ] as LangfuseColumnDef<JobExecutionRow>[];

  if (!jobConfigurationId) {
    columns.push(
      createLinkTableColumn<JobExecutionRow>({
        accessorKey: "evaluatorId",
        header: "Evaluator",
        getCell: (evaluatorId) => {
          if (evaluatorId) {
            return {
              type: "link",
              props: {
                path: `/project/${projectId}/evals/legacy/${encodeURIComponent(evaluatorId)}`,
                value: evaluatorId,
              },
            };
          }

          return undefined;
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
      scoreValue:
        jobConfig.score?.stringValue ?? jobConfig.score?.value ?? undefined,
      scoreComment: jobConfig.score?.comment ?? undefined,
      scoreMetadata: jobConfig.score?.metadata ?? undefined,
      startTime: jobConfig.startTime ?? undefined,
      endTime: jobConfig.endTime ?? undefined,
      traceId: jobConfig.jobInputTraceId ?? undefined,
      executionTraceId: jobConfig.executionTraceId ?? undefined,
      templateId: jobConfig.jobTemplateId ?? "",
      evaluatorId: jobConfig.jobConfigurationId,
      error: jobConfig.error ?? undefined,
    };
  };

  return (
    <DataTableControlsProvider
      tableName={evalLogFilterConfig.tableName}
      defaultSidebarCollapsed={evalLogFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        <DataTableToolbar
          columns={columns}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          filterState={queryFilter.filterState}
        />

        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="evalLogs"
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
              customRowHeights={evalLogRowHeights}
              rowHeight={rowHeight}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
