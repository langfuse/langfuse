import Header from "@/src/components/layouts/header";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import TableLink from "@/src/components/table/table-link";
import { usdFormatter } from "@/src/utils/numbers";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ScoreDataType } from "@langfuse/shared";

type PromptVersionTableRow = {
  version: number;
  labels: string[];
  medianLatency?: number | null;
  medianInputTokens?: number | null;
  medianOutputTokens?: number | null;
  medianCost?: number | null;
  generationCount?: number | null;
  averageObservationScores?: Record<string, number> | null;
  averageTraceScores?: Record<string, number> | null;
  lastUsed?: string | null;
  firstUsed?: string | null;
};

type PromptCoreOutput = RouterOutput["prompts"]["allVersions"];
type PromptMetricsOutput = RouterOutput["prompts"]["versionMetrics"];
type PromptMetric = PromptMetricsOutput[number];
type PromptCoreData = PromptCoreOutput["promptVersions"][number];

function joinPromptCoreAndMetricData(
  promptCoreData: PromptCoreOutput,
  promptMetricsData?: PromptMetricsOutput,
): {
  status: "loading" | "error" | "success";
  combinedData: (PromptCoreData & Partial<PromptMetric>)[] | undefined;
} {
  if (!promptCoreData) return { status: "error", combinedData: undefined }; // defensive should never happen

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

export default function PromptVersionTable() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const promptName = decodeURIComponent(router.query.promptName as string);

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

  const columns: LangfuseColumnDef<PromptVersionTableRow>[] = [
    {
      accessorKey: "version",
      id: "version",
      header: "Version",
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
      cell: ({ row }) => {
        const values: string[] = row.getValue("labels");
        return (
          values && (
            <div className="flex gap-1">
              {values.map((value) => (
                <div
                  key={value}
                  className="h-6 content-center rounded-sm bg-secondary px-1 text-center text-xs font-semibold text-secondary-foreground"
                >
                  {value}
                </div>
              ))}
            </div>
          )
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "medianLatency",
      id: "medianLatency",
      header: "Median latency",
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
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined | null =
          row.getValue("generationCount");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return value === undefined || value === null ? null : (
          <span>{String(value)}</span>
        );
      },
    },
    {
      accessorKey: "averageObservationScores",
      id: "averageObservationScores",
      header: "Average observation scores",
      cell: ({ row }) => {
        const scores: PromptVersionTableRow["averageObservationScores"] =
          row.getValue("averageObservationScores");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return (
          (scores && (
            <GroupedScoreBadges
              scores={Object.entries(scores).map(([k, v]) => ({
                name: k,
                value: v,
                dataType: ScoreDataType.NUMERIC, // numeric and boolean values treated as numeric
              }))}
              variant="headings"
            />
          )) ??
          null
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "averageTraceScores",
      id: "averageTraceScores",
      header: "Average trace scores",
      cell: ({ row }) => {
        const scores: PromptVersionTableRow["averageTraceScores"] =
          row.getValue("averageTraceScores");
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }

        return (
          (scores && (
            <GroupedScoreBadges
              scores={Object.entries(scores).map(([k, v]) => ({
                name: k,
                value: v,
                dataType: ScoreDataType.NUMERIC, // numeric and boolean values treated as numeric
              }))}
              variant="headings"
            />
          )) ??
          null
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "lastUsed",
      id: "lastUsed",
      header: "Last used",
      enableHiding: true,
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
      "promptVersionsColumnVisibility",
      columns,
    );

  if (!promptVersions.data) {
    return <div>Loading...</div>;
  }

  const totalCount = promptVersions?.data?.totalCount ?? 0;

  const { combinedData } = joinPromptCoreAndMetricData(
    promptVersions.data,
    promptMetrics.data,
  );

  const rows: PromptVersionTableRow[] =
    promptVersions.isSuccess && !!combinedData
      ? combinedData.map((prompt) => ({
          version: prompt.version,
          labels: prompt.labels,
          medianLatency: prompt.medianLatency,
          medianInputTokens: prompt.medianInputTokens,
          medianOutputTokens: prompt.medianOutputTokens,
          medianCost: prompt.medianTotalCost,
          generationCount: prompt.observationCount,
          averageObservationScores: prompt.averageObservationScores,
          averageTraceScores: prompt.averageTraceScores,
          lastUsed:
            prompt.lastUsed?.toLocaleString() ?? "No linked generation yet",
          firstUsed:
            prompt.firstUsed?.toLocaleString() ?? "No linked generation yet",
        }))
      : [];

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden xl:container lg:h-[calc(100vh-2rem)]">
      <Header
        title={promptName}
        help={{
          description:
            "You can use this prompt within your application through the Langfuse SDKs and integrations. Refer to the documentation for more information.",
          href: "https://langfuse.com/docs/prompts",
        }}
        breadcrumb={[
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
          {
            name: promptName ?? router.query.promptName,
            href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
          },
          { name: `Metrics` },
        ]}
        actionButtons={
          <>
            <Tabs value="metrics">
              <TabsList>
                <TabsTrigger value="editor" asChild>
                  <Link
                    href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}`}
                  >
                    Editor
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />
      <div className="gap-3">
        <DataTableToolbar
          columns={columns}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibilityState}
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
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibilityState}
        rowHeight={rowHeight}
      />
    </div>
  );
}
