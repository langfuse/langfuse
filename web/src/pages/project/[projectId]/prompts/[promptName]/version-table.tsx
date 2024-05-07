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

type PromptVersionTableRow = {
  version: number;
  labels: string[];
  meanLatency?: number | null;
  meanInputTokens?: number | null;
  meanOutputTokens?: number | null;
  meanCost?: number | null;
  generationCount?: number | null;
  lastUsed?: string | null;
  firstUsed?: string | null;
};

type PromptCoreOutput = RouterOutput["prompts"]["allVersions"];
type PromptMetricsOutput = RouterOutput["prompts"]["metrics"];
type PromptMetric = PromptMetricsOutput[number];
type PromptCoreData = PromptCoreOutput[number];

function joinPromptCoreAndMetricData(
  promptCoreData: PromptCoreOutput,
  promptMetricsData?: PromptMetricsOutput,
): {
  status: "loading" | "error" | "success";
  combinedData: (PromptCoreData & Partial<PromptMetric>)[] | undefined;
} {
  if (!promptCoreData) return { status: "error", combinedData: undefined }; // defensive should never happen

  if (!promptMetricsData)
    return { status: "success", combinedData: promptCoreData };

  const promptMetricsMap = promptMetricsData.reduce(
    (acc, metric: PromptMetric) => {
      acc.set(metric.id, metric);
      return acc;
    },
    new Map<string, PromptMetric>(),
  );

  const combinedData = promptCoreData.map((coreData) => {
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
            <div>
              {values.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
          )
        );
      },
    },
    {
      accessorKey: "meanLatency",
      id: "meanLatency",
      header: "Mean latency (ms)",
    },
    {
      accessorKey: "meanInputTokens",
      id: "meanInputTokens",
      header: "Mean input tokens",
    },
    {
      accessorKey: "meanOutputTokens",
      id: "meanOutputTokens",
      header: "Mean output tokens",
    },
    {
      accessorKey: "meanCost",
      id: "meanCost",
      header: "Mean cost (USD)",
    },
    {
      accessorKey: "generationCount",
      id: "generationCount",
      header: "Generations count",
    },
    {
      accessorKey: "lastUsed",
      id: "lastUsed",
      header: "Last used",
    },
    {
      accessorKey: "firstUsed",
      id: "firstUsed",
      header: "First used",
    },
  ];

  const promptHistory = api.prompts.allVersions.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      name: promptName,
    },
    { enabled: Boolean(projectId) },
  );

  const promptIds = promptHistory.isSuccess
    ? promptHistory.data?.map((prompt) => prompt.id)
    : [];

  const promptMetrics = api.prompts.metrics.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      promptIds,
    },
    {
      enabled: Boolean(projectId) && promptHistory.isSuccess,
    },
  );

  if (!promptHistory.data) {
    return <div>Loading...</div>;
  }

  const totalCount = promptHistory.data.length ?? 0;

  const { combinedData } = joinPromptCoreAndMetricData(
    promptHistory.data,
    promptMetrics.data,
  );

  const rows: PromptVersionTableRow[] =
    promptHistory.isSuccess && !!combinedData
      ? combinedData.map((prompt) => ({
          version: prompt.version,
          labels: prompt.labels,
          meanLatency: prompt.latency,
          meanInputTokens: prompt.medianInputTokens,
          meanOutputTokens: prompt.medianOutputTokens,
          meanCost: prompt.medianTotalCost,
          generationCount: prompt.observation_count,
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
          <div className="gap-3 p-2.5">
            <DataTableToolbar
              columns={columns}
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
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
            rowHeight={rowHeight}
          />
        </div>
      </div>
    </div>
  );
}
