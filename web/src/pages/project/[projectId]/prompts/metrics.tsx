import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import TableLink from "@/src/components/table/table-link";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { formatIntervalSeconds } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { Skeleton } from "@/src/components/ui/skeleton";
import { verifyAndPrefixScoreDataAgainstKeys } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import Page from "@/src/components/layouts/page";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { TruncatedLabels } from "@/src/components/TruncatedLabels";
import {
  getPromptTabs,
  PROMPT_TABS,
} from "@/src/features/navigation/utils/prompt-tabs";

export type PromptVersionTableRow = {
  version: number;
  labels: string[];
  medianLatency?: number | null;
  medianInputTokens?: number | null;
  medianOutputTokens?: number | null;
  medianCost?: number | null;
  generationCount?: bigint | null;
  traceScores?: ScoreAggregate;
  generationScores?: ScoreAggregate;
  lastUsed?: string | null;
  firstUsed?: string | null;
};

type PromptCoreOutput = RouterOutput["prompts"]["allVersions"];
type PromptMetricsOutput = RouterOutput["prompts"]["versionMetrics"];
type PromptMetric = PromptMetricsOutput[number];
type PromptCoreData = PromptCoreOutput["promptVersions"][number];

function joinPromptCoreAndMetricData(
  promptCoreData?: PromptCoreOutput,
  promptMetricsData?: PromptMetricsOutput,
): {
  status: "loading" | "error" | "success";
  combinedData: (PromptCoreData & Partial<PromptMetric>)[] | undefined;
} {
  if (!promptCoreData) return { status: "loading", combinedData: undefined };

  const { promptVersions } = promptCoreData;

  if (!promptMetricsData)
    return { status: "success", combinedData: promptVersions };

  const promptMetricsMap = promptMetricsData.reduce(
    (acc, metric: PromptMetric) => {
      acc.set(metric.id, metric);
      return acc;
    },
    new Map<string, PromptMetric>(),
  );

  const combinedData = promptVersions.map((coreData) => {
    const metric = promptMetricsMap.get(coreData.id);
    return {
      ...coreData,
      ...(metric && metric),
    };
  });

  return { status: "success", combinedData };
}

export default function PromptVersionTable({
  promptName: promptNameProp,
}: { promptName?: string } = {}) {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const promptName =
    promptNameProp ||
    (router.query.promptName
      ? decodeURIComponent(router.query.promptName as string)
      : "");

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "promptVersion",
    "s",
  );

  const promptVersions = api.prompts.allVersions.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      name: promptName,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: Boolean(projectId) },
  );

  const promptIds = promptVersions.isSuccess
    ? promptVersions.data?.promptVersions.map((prompt) => prompt.id)
    : [];

  const promptMetrics = api.prompts.versionMetrics.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      promptIds,
    },
    {
      enabled: Boolean(projectId) && promptVersions.isSuccess,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const {
    scoreColumns: traceScoreColumns,
    scoreKeysAndProps,
    isColumnLoading: isTraceColumnLoading,
  } = useIndividualScoreColumns<PromptVersionTableRow>({
    projectId,
    scoreColumnPrefix: "Trace",
    scoreColumnKey: "traceScores",
    showAggregateViewOnly: true,
  });

  const {
    scoreColumns: generationScoreColumns,
    isColumnLoading: isGenerationColumnLoading,
  } = useIndividualScoreColumns<PromptVersionTableRow>({
    projectId,
    scoreColumnPrefix: "Generation",
    scoreColumnKey: "generationScores",
    showAggregateViewOnly: true,
  });

  const columns: LangfuseColumnDef<PromptVersionTableRow>[] = [
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
      size: 80,
      cell: ({ row }) => {
        const version = row.getValue("version");
        return typeof version === "number" ? (
          <TableLink
            path={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}/?version=${version}`}
            value={String(version)}
          />
        ) : null;
      },
    },
    {
      accessorKey: "labels",
      id: "labels",
      header: "Labels",
      size: 160,
      cell: ({ row }) => {
        const values: string[] = row.getValue("labels");
        return (
          values && (
            <TruncatedLabels
              labels={values}
              maxVisibleLabels={3}
              className="-mr-8 flex max-h-full flex-wrap gap-1"
              showSimpleBadges={true}
            />
          )
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "medianLatency",
      id: "medianLatency",
      header: "Median latency",
      size: 140,
      cell: ({ row }) => {
        const latency: number | undefined | null =
          row.getValue("medianLatency");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return !!latency ? (
          <span>{formatIntervalSeconds(latency, 3)}</span>
        ) : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "medianInputTokens",
      id: "medianInputTokens",
      header: "Median input tokens",
      size: 160,
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined | null =
          row.getValue("medianInputTokens");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return !!value ? <span>{String(value)}</span> : undefined;
      },
    },
    {
      accessorKey: "medianOutputTokens",
      id: "medianOutputTokens",
      header: "Median output tokens",
      size: 170,
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined | null =
          row.getValue("medianOutputTokens");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return !!value ? <span>{String(value)}</span> : undefined;
      },
    },
    {
      accessorKey: "medianCost",
      id: "medianCost",
      header: "Median cost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined | null = row.getValue("medianCost");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return !!value ? <span>{usdFormatter(value)}</span> : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "generationCount",
      id: "generationCount",
      header: "Generations count",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: bigint | undefined | null =
          row.getValue("generationCount");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value === undefined || value === null ? null : (
          <span>{numberFormatter(value, 0)}</span>
        );
      },
    },
    {
      accessorKey: "traceScores",
      header: "Trace Scores",
      id: "traceScores",
      enableHiding: true,
      columns: traceScoreColumns,
      cell: () => {
        return isTraceColumnLoading ? (
          <Skeleton className="h-3 w-1/2"></Skeleton>
        ) : null;
      },
    },
    {
      accessorKey: "generationScores",
      header: "Generation Scores",
      id: "generationScores",
      enableHiding: true,
      columns: generationScoreColumns,
      cell: () => {
        return isGenerationColumnLoading ? (
          <Skeleton className="h-3 w-1/2"></Skeleton>
        ) : null;
      },
    },
    {
      accessorKey: "lastUsed",
      id: "lastUsed",
      header: "Last used",
      enableHiding: true,
      size: 150,
      headerTooltip: {
        description:
          "The last time this prompt version was used in a generation. See docs for details on how to link generations/traces to prompt versions.",
        href: "https://langfuse.com/docs/prompts",
      },
      cell: ({ row }) => {
        const value: number | undefined | null = row.getValue("lastUsed");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return !!value ? <span>{value}</span> : undefined;
      },
    },
    {
      accessorKey: "firstUsed",
      id: "firstUsed",
      header: "First used",
      size: 150,
      enableHiding: true,
      headerTooltip: {
        description:
          "The first time this prompt version was used in a generation. See docs for details on how to link generations/traces to prompt versions.",
        href: "https://langfuse.com/docs/prompts",
      },
      cell: ({ row }) => {
        const value: number | undefined | null = row.getValue("firstUsed");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return !!value ? <span>{value}</span> : undefined;
      },
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<PromptVersionTableRow>(
      `promptVersionsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<PromptVersionTableRow>(
    "promptVersionsColumnOrder",
    columns,
  );

  const totalCount = promptVersions?.data?.totalCount ?? null;

  const { combinedData } = joinPromptCoreAndMetricData(
    promptVersions.data,
    promptMetrics.data,
  );

  const rows: PromptVersionTableRow[] =
    promptVersions.isSuccess && !!combinedData
      ? combinedData.map((prompt) => {
          return {
            version: prompt.version,
            labels: prompt.labels,
            medianLatency: prompt.medianLatency,
            medianInputTokens: prompt.medianInputTokens,
            medianOutputTokens: prompt.medianOutputTokens,
            medianCost: prompt.medianTotalCost,
            generationCount: prompt.observationCount,
            traceScores: verifyAndPrefixScoreDataAgainstKeys(
              scoreKeysAndProps,
              prompt.traceScores ?? {},
              "Trace",
            ),
            generationScores: verifyAndPrefixScoreDataAgainstKeys(
              scoreKeysAndProps,
              prompt.observationScores ?? {},
              "Generation",
            ),
            lastUsed:
              prompt.lastUsed?.toLocaleString() ?? "No linked generation yet",
            firstUsed:
              prompt.firstUsed?.toLocaleString() ?? "No linked generation yet",
          };
        })
      : [];

  return (
    <Page
      headerProps={{
        title: promptName,
        itemType: "PROMPT",
        help: {
          description:
            "You can use this prompt within your application through the Langfuse SDKs and integrations. Refer to the documentation for more information.",
          href: "https://langfuse.com/docs/prompts",
        },
        breadcrumb: [
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
          {
            name: promptName ?? router.query.promptName,
            href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
          },
          { name: `Metrics` },
        ],
        actionButtonsRight: (
          <DetailPageNav
            key="nav"
            currentId={promptName}
            path={(entry) => `/project/${projectId}/prompts/${entry.id}`}
            listKey="prompts"
          />
        ),
        tabsProps: {
          tabs: getPromptTabs(projectId, promptName),
          activeTab: PROMPT_TABS.METRICS,
        },
      }}
    >
      <div className="gap-3">
        <DataTableToolbar
          columns={columns}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibilityState}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
        />
      </div>
      <DataTable
        columns={columns}
        data={
          promptVersions.isLoading
            ? { isLoading: true, isError: false }
            : promptVersions.error
              ? {
                  isLoading: false,
                  isError: true,
                  error: promptVersions.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: rows,
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibilityState}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </Page>
  );
}
