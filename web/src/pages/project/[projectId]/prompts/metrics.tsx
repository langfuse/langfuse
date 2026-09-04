import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { formatIntervalSeconds } from "@/src/utils/dates";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type ScoreAggregate } from "@langfuse/shared";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import Page from "@/src/components/layouts/page";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { TruncatedLabels } from "@/src/components/TruncatedLabels";
import {
  getPromptTabs,
  PROMPT_TABS,
} from "@/src/features/navigation/utils/prompt-tabs";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import {
  scoreFilters,
  addPrefixToScoreKeys,
} from "@/src/features/scores/lib/scoreColumns";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { useMemo } from "react";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";

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
  // Defaults to true because this component always renders its own `Page`, so
  // the header controls slot is available. Set false if ever embedded without
  // a `Page` ancestor, to fall back to the toolbar.
  showControlsInPageHeader = true,
}: { promptName?: string; showControlsInPageHeader?: boolean } = {}) {
  const router = useRouter();
  const projectId = useProjectIdFromURL() ?? "";
  const promptNameFromQuery = router.query.promptName;
  const promptName =
    promptNameProp ||
    (typeof promptNameFromQuery === "string"
      ? decodeURIComponent(promptNameFromQuery)
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
  const { timeRange, setTimeRange } = useTableDateRange(projectId, {
    defaultRelativeAggregation: "last30Days",
  });
  const dateRange = useMemo(
    () => ("range" in timeRange ? toAbsoluteTimeRange(timeRange) : timeRange),
    [timeRange],
  );

  const promptVersions = api.prompts.allVersions.useQuery(
    {
      projectId,
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
      projectId,
      promptIds,
      fromTimestamp: dateRange?.from,
      toTimestamp: dateRange?.to,
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

  const { scoreColumns: traceScoreColumns, isLoading: isTraceColumnLoading } =
    useScoreColumns<PromptVersionTableRow>({
      scoreColumnKey: "traceScores",
      projectId: projectId,
      filter: scoreFilters.forTraceLevel(),
      prefix: "Trace",
    });

  const {
    scoreColumns: generationScoreColumns,
    isLoading: isGenerationColumnLoading,
  } = useScoreColumns<PromptVersionTableRow>({
    scoreColumnKey: "generationScores",
    projectId: projectId,
    filter: scoreFilters.forObservations(),
    prefix: "Generation",
  });

  const columns: LangfuseColumnDef<PromptVersionTableRow>[] = [
    createLinkTableColumn<PromptVersionTableRow, number>({
      accessorKey: "version",
      header: "Version",
      isPinnedLeft: true,
      size: 80,
      getCell: (version) => {
        if (typeof version !== "number") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}/?version=${version}`,
            value: String(version),
          },
        };
      },
    }),
    {
      accessorKey: "labels",
      id: "labels",
      header: "Labels",
      isPinnedLeft: true,
      size: 160,
      cell: ({ row }) => {
        const values: string[] = row.getValue("labels");
        return (
          values &&
          values.length > 0 && (
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
    createNumberTableColumn<PromptVersionTableRow>({
      accessorKey: "medianLatency",
      header: "Median latency",
      size: 140,
      formatter: (value) => formatIntervalSeconds(value / 1000, 3),
      getValue: (value) => {
        if (!promptMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
      enableHiding: true,
    }),
    createNumberTableColumn<PromptVersionTableRow>({
      accessorKey: "medianInputTokens",
      header: "Median input tokens",
      size: 160,
      enableHiding: true,
      formatter: (value) => String(value),
      getValue: (value) => {
        if (!promptMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<PromptVersionTableRow>({
      accessorKey: "medianOutputTokens",
      header: "Median output tokens",
      size: 170,
      enableHiding: true,
      formatter: (value) => String(value),
      getValue: (value) => {
        if (!promptMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
    }),
    createNumberTableColumn<PromptVersionTableRow>({
      accessorKey: "medianCost",
      header: "Median cost",
      size: 120,
      formatter: (value) => usdFormatter(value),
      getValue: (value) => {
        if (!promptMetrics.isSuccess) return { type: "loading" };
        if (!value) return undefined;

        return value;
      },
      enableHiding: true,
    }),
    createNumberTableColumn<PromptVersionTableRow, bigint>({
      accessorKey: "generationCount",
      header: "Generations count",
      size: 150,
      enableHiding: true,
      formatter: (value) => numberFormatter(value, 0),
      getValue: (value) =>
        promptMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
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
    createTextTableColumn<PromptVersionTableRow>({
      accessorKey: "lastUsed",
      header: "Last used",
      enableHiding: true,
      size: 150,
      headerTooltip: {
        description:
          "This is calculated based on the selected date range, not the full usage history.",
      },
      mapValue: (value) =>
        promptMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
    createTextTableColumn<PromptVersionTableRow>({
      accessorKey: "firstUsed",
      header: "First used",
      size: 150,
      enableHiding: true,
      headerTooltip: {
        description:
          "This is calculated based on the selected date range, not the full usage history.",
      },
      mapValue: (value) =>
        promptMetrics.isSuccess ? (value ?? undefined) : { type: "loading" },
    }),
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
            traceScores: addPrefixToScoreKeys(
              prompt.traceScores ?? {},
              "Trace",
            ),
            generationScores: addPrefixToScoreKeys(
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
          href: "https://langfuse.com/docs/prompt-management/get-started",
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
      {showControlsInPageHeader && (
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      )}
      <div className="gap-3">
        <DataTableToolbar
          columns={columns}
          timeRange={showControlsInPageHeader ? undefined : timeRange}
          setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibilityState}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
        />
      </div>
      <DataTable
        tableName="promptVersions"
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
