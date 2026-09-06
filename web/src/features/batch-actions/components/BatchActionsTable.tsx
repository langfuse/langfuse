import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { useTranslations } from "next-intl";

const actionTypeMessageKey: Record<
  string,
  | "scoreDelete"
  | "datasetDelete"
  | "traceDelete"
  | "traceAddToAnnotationQueue"
  | "sessionAddToAnnotationQueue"
  | "observationAddToAnnotationQueue"
  | "addToDataset"
  | "runEvaluation"
  | "experimentCompare"
> = {
  "score-delete": "scoreDelete",
  "dataset-delete": "datasetDelete",
  "trace-delete": "traceDelete",
  "trace-add-to-annotation-queue": "traceAddToAnnotationQueue",
  "session-add-to-annotation-queue": "sessionAddToAnnotationQueue",
  "observation-add-to-annotation-queue": "observationAddToAnnotationQueue",
  "observation-add-to-dataset": "addToDataset",
  "observation-run-batched-evaluation": "runEvaluation",
  "experiment-compare": "experimentCompare",
};

const tableMessageKey: Record<
  string,
  | "scores"
  | "sessions"
  | "traces"
  | "observations"
  | "events"
  | "datasets"
  | "datasetRunItems"
  | "datasetItems"
  | "auditLogs"
> = {
  scores: "scores",
  sessions: "sessions",
  observations: "observations",
  events: "events",
  traces: "traces",
  datasets: "datasets",
  dataset_run_items: "datasetRunItems",
  dataset_items: "datasetItems",
  audit_logs: "auditLogs",
};

const statusMessageKey: Record<
  string,
  "queued" | "processing" | "completed" | "failed" | "partial"
> = {
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  PARTIAL: "partial",
};

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
  const t = useTranslations("operationsUi.batchActions.table");
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
      header: t("actionType"),
      size: 200,
      mapValue: (value) => {
        const key = value ? actionTypeMessageKey[value] : undefined;
        return key
          ? t(`actionTypes.${key}`)
          : value
              ?.split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
      },
    }),
    {
      accessorKey: "tableName",
      id: "tableName",
      header: t("table"),
      size: 120,
      cell: ({ row }) => {
        const tableName = row.getValue("tableName") as string;
        const key = tableMessageKey[tableName];
        return <span>{key ? t(`tables.${key}`) : tableName}</span>;
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: t("status"),
      size: 110,
      cell: ({ row }) => {
        const status = row.original.status;
        const key = statusMessageKey[status];
        return (
          <StatusBadge type={status.toLowerCase()} showText={false}>
            {key ? t(`statuses.${key}`) : status}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: "progress",
      id: "progress",
      header: t("progress"),
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
                {t("failedCount", { count: failedCount })}
              </div>
            )}
          </div>
        );
      },
    },
    createDateTableColumn<BatchActionRow>({
      accessorKey: "createdAt",
      header: t("created"),
      size: 150,
    }),
    {
      accessorKey: "finishedAt",
      id: "finishedAt",
      header: t("finished"),
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
    createUserTableColumn<BatchActionRow>({
      accessorKey: "user",
      header: t("createdBy"),
      size: 150,
      variant: "avatar",
      emptyValue: t("unknown"),
    }),
    {
      accessorKey: "log",
      id: "log",
      header: t("log"),
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
