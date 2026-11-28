import { useId } from "react";
import { api } from "@/src/utils/api";
import { homeCategoryInput } from "./homeCategoryQuery";
import { homeScoreInput, homeScoreRows } from "./homeScoreAggregate";
import { type QueryType } from "@langfuse/shared/query";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { shouldUseWidgetSSE } from "@/src/features/widgets/utils";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  normalizeMultiQueryResults,
  type MultiQueryPlan,
  type PlannedMultiQuery,
} from "./multiQueryModel";

const unusedQuery: QueryType = {
  view: "observations",
  dimensions: [],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: "2026-01-01T00:00:00Z",
  toTimestamp: "2026-01-02T00:00:00Z",
  orderBy: null,
};

function useQuerySlot(
  source: PlannedMultiQuery | undefined,
  context: {
    projectId: string;
    readPath: ResolvedReadPath;
    refreshKey: number;
    enabled: boolean;
    slotId: string;
  },
) {
  const version = source?.version ?? (context.readPath === "v4" ? "v2" : "v1");
  const utils = api.useUtils();
  const category = source?.homeCategory;
  const scoreFilters = source?.homeScoreFilters;
  const fetchScore =
    source && scoreFilters
      ? {
          key: "home:score-aggregate",
          fetch: async () => {
            const rows = await utils.dashboard.chart.fetch(
              homeScoreInput(
                context.projectId,
                version,
                source.query,
                scoreFilters,
              ),
              { trpc: { context: { skipBatch: true } }, staleTime: 0 },
            );
            return homeScoreRows(source.query, rows);
          },
        }
      : undefined;
  return useScheduledDashboardExecuteQuery(
    {
      projectId: context.projectId,
      version,
      query: source?.query ?? unusedQuery,
    },
    {
      queryId: context.slotId,
      enabled: context.enabled && Boolean(source),
      refreshKey: context.refreshKey,
      fetchQuery: category
        ? {
            key: category.queryName,
            fetch: async (query) => {
              const rows = await utils.dashboard.chart.fetch(
                homeCategoryInput(context.projectId, query, category),
                { trpc: { context: { skipBatch: true } }, staleTime: 0 },
              );
              return rows.map((row) => ({
                time_dimension: new Date(
                  String(row.intervalStart),
                ).toISOString(),
                [category.field]: row.key,
                ["sum_" + category.measure]: row.sum,
              }));
            },
          }
        : fetchScore,
      trpc: { context: { skipBatch: true } },
      meta: { silentHttpCodes: [400, 412, 422] },
      retry: false,
      useSSE: shouldUseWidgetSSE({
        isV4Enabled: context.readPath === "v4",
        version,
      }),
    },
  );
}

/** Five fixed slots keep hooks stable while each ordinary query owns its scheduler registration. */
export function useMultiQueryResults(
  plan: MultiQueryPlan | undefined,
  context: {
    projectId: string;
    readPath: ResolvedReadPath;
    refreshKey: number;
    enabled: boolean;
  },
) {
  const instance = useId();
  const results = [
    useQuerySlot(plan?.queries[0], { ...context, slotId: `${instance}:0` }),
    useQuerySlot(plan?.queries[1], { ...context, slotId: `${instance}:1` }),
    useQuerySlot(plan?.queries[2], { ...context, slotId: `${instance}:2` }),
    useQuerySlot(plan?.queries[3], { ...context, slotId: `${instance}:3` }),
    useQuerySlot(plan?.queries[4], { ...context, slotId: `${instance}:4` }),
  ];
  return normalizeMultiQueryResults(
    plan ?? { queries: [], warnings: [] },
    results,
  );
}
