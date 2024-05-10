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
type PromptMetricsOutput = RouterOutput["prompts"]["metrics"];
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
        const latency: number | undefined = row.getValue("medianLatency");
        return latency !== undefined ? (
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
    },
    {
      accessorKey: "medianOutputTokens",
      id: "medianOutputTokens",
      header: "Median output tokens",
      enableHiding: true,
    },
    {
      accessorKey: "medianCost",
      id: "medianCost",
      header: "Median cost",
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("medianCost");

        return value !== undefined ? (
          <span>{usdFormatter(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "generationCount",
      id: "generationCount",
      header: "Generations count",
      enableHiding: true,
    },
    {
      accessorKey: "averageObservationScores",
      id: "averageObservationScores",
      header: "Average observation scores",
      cell: ({ row }) => {
        const scores: PromptVersionTableRow["averageObservationScores"] =
          row.getValue("averageObservationScores");

        return (
          (scores && (
            <GroupedScoreBadges
              scores={Object.entries(scores).map(([k, v]) => ({
                name: k,
                value: v,
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

        return (
          (scores && (
            <GroupedScoreBadges
              scores={Object.entries(scores).map(([k, v]) => ({
                name: k,
                value: v,
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
    },
    {
      accessorKey: "firstUsed",
      id: "firstUsed",
      header: "First used",
      enableHiding: true,
    },
  ];

  const promptHistory = api.prompts.allVersions.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      name: promptName,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: Boolean(projectId) },
  );

  const promptIds = promptHistory.isSuccess
    ? promptHistory.data?.promptVersions.map((prompt) => prompt.id)
    : [];

  const promptMetrics = api.prompts.metrics.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      promptIds,
    },
    {
      enabled: Boolean(projectId) && promptHistory.isSuccess,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<PromptVersionTableRow>(
      "promptVersionsColumnVisibility",
      columns,
    );

  if (!promptHistory.data) {
    return <div>Loading...</div>;
  }

  const totalCount = promptHistory?.data?.totalCount ?? 0;

  const { combinedData } = joinPromptCoreAndMetricData(
    promptHistory.data,
    promptMetrics.data,
  );

  const rows: PromptVersionTableRow[] =
    promptHistory.isSuccess && !!combinedData
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
          lastUsed: prompt.lastUsed?.toLocaleString() ?? "No event yet",
          firstUsed: prompt.firstUsed?.toLocaleString() ?? "No event yet",
        }))
      : [];

  return (
    <div className="flex flex-col xl:container md:h-[calc(100vh-2rem)]">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3">
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
              { name: `Version Table` },
            ]}
            actionButtons={
              <>
                <Tabs value="table">
                  <TabsList>
                    <TabsTrigger value="editor" asChild>
                      <Link
                        href={`/project/${projectId}/prompts/${encodeURIComponent(promptName)}`}
                      >
                        Editor
                      </Link>
                    </TabsTrigger>
                    <TabsTrigger value="table">Table</TabsTrigger>
                  </TabsList>
                </Tabs>
              </>
            }
          />
          <div className="gap-3 p-2">
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
              promptHistory.isLoading
                ? { isLoading: true, isError: false }
                : promptHistory.error
                  ? {
                      isLoading: false,
                      isError: true,
                      error: promptHistory.error.message,
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
      </div>
    </div>
  );
}
