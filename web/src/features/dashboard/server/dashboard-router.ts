import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterInterface,
  sqlInterface,
} from "@/src/server/api/services/sqlInterface";
import { createHistogramData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { TRPCError } from "@trpc/server";
import {
  getScoreAggregate,
  getNumericScoreHistogram,
  extractFromAndToTimestampsFromFilter,
  logger,
  getObservationCostByTypeByTime,
  getObservationUsageByTypeByTime,
  DashboardService,
  DashboardDefinitionSchema,
} from "@langfuse/shared/src/server";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import {
  type QueryType,
  query as customQuery,
  viewVersions,
} from "@/src/features/query/types";
import { mapLegacyUiTableFilterToView } from "@/src/features/query/dashboardUiTableToViewMapping";
import {
  paginationZod,
  orderBy,
  StringNoHTML,
  InvalidRequestError,
  singleFilter,
  type FilterState,
} from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { executeQuery } from "@/src/features/query/server/queryExecutor";

// Define the dashboard list input schema
const ListDashboardsInput = z.object({
  projectId: z.string(),
  ...paginationZod,
  orderBy: orderBy,
});

// Get dashboard by ID input schema
const GetDashboardInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
});

// Update dashboard definition input schema
const UpdateDashboardDefinitionInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
  definition: DashboardDefinitionSchema,
});

// Update dashboard input schema
const UpdateDashboardInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
  name: StringNoHTML.min(1, "Dashboard name is required"),
  description: StringNoHTML,
});

// Create dashboard input schema
const CreateDashboardInput = z.object({
  projectId: z.string(),
  name: StringNoHTML.min(1, "Dashboard name is required"),
  description: StringNoHTML,
});

// Clone dashboard input schema
const CloneDashboardInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
});

// Update dashboard filters input schema
const UpdateDashboardFiltersInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
  filters: z.array(singleFilter),
});

// Map camelCase legacy column names (used by scoreHistogram component)
// to view-native field names before passing through the general mapper.
const LEGACY_CAMEL_CASE_MAP: Record<string, string> = {
  scoreName: "name",
  scoreSource: "source",
  scoreDataType: "dataType",
};

/**
 * Shared filter preparation for scores-numeric v2 queries.
 * Extracts time boundaries, strips time filters, and maps legacy UI column
 * names to view-native field names.
 */
function prepareScoresNumericV2Params(filter: FilterState) {
  const [from, to] = extractFromAndToTimestampsFromFilter(filter);
  // Fallback to 2000-01-01 instead of epoch 0 — ClickHouse DateTimeFilter
  // passes new Date(value).getTime() as the parameter, and the value 0
  // (epoch) is rejected by ClickHouse's DateTime64(3) parameter parser.
  const fromIso = from?.value
    ? new Date(from.value as Date).toISOString()
    : new Date("2000-01-01T00:00:00.000Z").toISOString();
  const toIso = to?.value
    ? new Date(to.value as Date).toISOString()
    : new Date().toISOString();
  const nonTimeFilters = filter.filter(
    (f) => f.column !== "scoreTimestamp" && f.column !== "startTime",
  );
  const normalizedFilters = nonTimeFilters.map((f) => {
    const mapped = LEGACY_CAMEL_CASE_MAP[f.column];
    return mapped ? { ...f, column: mapped } : f;
  });

  const mappedFilters = mapLegacyUiTableFilterToView(
    "scores-numeric",
    normalizedFilters,
  );
  return { fromIso, toIso, mappedFilters };
}

/**
 * Converts ClickHouse histogram(N)(...) output to the { chartData, chartLabels }
 * shape returned by createHistogramData (used by the NumericScoreHistogram component).
 *
 * ClickHouse histogram() returns an Array(Tuple(Float64, Float64, Float64))
 * where each tuple is (lower_bound, upper_bound, count).
 * The result column is named "histogram_value" by QueryBuilder
 * (pattern: `${aggregation}_${alias}`).
 */
function clickhouseHistogramToChartData(
  result: Array<Record<string, unknown>>,
): {
  chartData: Array<{ binLabel: string; count: number }>;
  chartLabels: string[];
} {
  if (result.length > 0 && !("histogram_value" in result[0])) {
    throw new Error(
      `Expected histogram_value column in QueryBuilder result, got: ${Object.keys(result[0]).join(", ")}`,
    );
  }
  const histogramBins = result[0]?.histogram_value as
    | Array<[number, number, number]>
    | undefined;
  if (!histogramBins?.length) return { chartData: [], chartLabels: [] };

  const round = (v: number) => parseFloat(v.toFixed(2));
  return {
    chartLabels: ["count"],
    chartData: histogramBins.map(([lower, upper, count]) => ({
      binLabel: `[${round(lower)}, ${round(upper)}]`,
      count: Math.round(count),
    })),
  };
}

async function getScoreAggregateV2({
  projectId,
  filter,
}: {
  projectId: string;
  filter: FilterState;
}): Promise<DatabaseRow[]> {
  // prepareScoresNumericV2Params also applies LEGACY_CAMEL_CASE_MAP for
  // scoreHistogram callers. For score-aggregate calls, the only camelCase
  // column is "scoreTimestamp" which is stripped as a time filter before
  // LEGACY_CAMEL_CASE_MAP runs, making the normalization step a no-op here.
  const { fromIso, toIso, mappedFilters } =
    prepareScoresNumericV2Params(filter);

  // Non-time filters in their original form — used for categorical query
  // filter mapping and value filter detection below.
  const nonTimeFilters = filter.filter(
    (f) => f.column !== "scoreTimestamp" && f.column !== "startTime",
  );

  const baseQuery = {
    dimensions: [{ field: "name" }, { field: "source" }, { field: "dataType" }],
    timeDimension: null,
    fromTimestamp: fromIso,
    toTimestamp: toIso,
    orderBy: [{ field: "sum_count", direction: "desc" as const }],
  };

  const numericQuery: QueryType = {
    ...baseQuery,
    view: "scores-numeric",
    metrics: [
      { measure: "count", aggregation: "sum" },
      { measure: "value", aggregation: "avg" },
    ],
    filters: mappedFilters,
  };

  // The scores-categorical view has no "value" dimension, so we handle value
  // filters manually: categorical scores always have value=0 in ClickHouse, so
  // value=0 should include all categoricals, while any other value filter
  // (e.g. value=1) should exclude them. This matches v1 behavior where numeric
  // and categorical scores are queried together in a single SQL statement.
  const valueFilter = nonTimeFilters.find((f) => f.column === "value");
  const skipCategorical =
    valueFilter && "value" in valueFilter && valueFilter.value !== 0;
  const categoricalFilters = nonTimeFilters.filter((f) => f.column !== "value");

  const categoricalQuery: QueryType = {
    ...baseQuery,
    view: "scores-categorical",
    metrics: [{ measure: "count", aggregation: "sum" }],
    filters: mapLegacyUiTableFilterToView(
      "scores-categorical",
      categoricalFilters,
    ),
  };

  const [numericResults, categoricalResults] = await Promise.all([
    executeQuery(projectId, numericQuery, "v2"),
    skipCategorical
      ? Promise.resolve([])
      : executeQuery(projectId, categoricalQuery, "v2"),
  ]);

  const merged = [
    ...numericResults.map((r) => ({
      scoreName: String(r.name),
      countScoreId: Number(r.sum_count ?? 0),
      avgValue: Number(r.avg_value ?? 0),
      scoreSource: String(r.source),
      scoreDataType: String(r.dataType),
    })),
    ...categoricalResults.map((r) => ({
      scoreName: String(r.name),
      countScoreId: Number(r.sum_count ?? 0),
      avgValue: 0,
      scoreSource: String(r.source),
      scoreDataType: String(r.dataType),
    })),
  ].sort((a, b) => b.countScoreId - a.countScoreId);

  return merged as DatabaseRow[];
}

async function getObservationsByTypeV2(params: {
  projectId: string;
  filter: FilterState;
  dimensionField: "costType" | "usageType";
  metricMeasure: "costByType" | "usageByType";
}): Promise<DatabaseRow[]> {
  const { projectId, filter, dimensionField, metricMeasure } = params;

  const [from, to] = extractFromAndToTimestampsFromFilter(filter);
  if (!from?.value || !to?.value) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Time filter required",
    });
  }

  // Filter normalisation for the executeQuery (v2) path:
  //
  // Filters arriving here originate from two different column-naming conventions:
  //   A) uiTableName format ("Model", "Environment", …) — used by globalFilterState
  //      filters that come from the standard dashboard filter bar. These are handled
  //      canonically by mapLegacyUiTableFilterToView (see dashboardUiTableToViewMapping.ts).
  //   B) uiTableId format ("model") — used by ModelSelectorPopover, which constructs
  //      its filter using the lower-camel uiTableId rather than the display uiTableName.
  //      mapLegacyUiTableFilterToView matches on uiTableName so it cannot cover this case.
  //
  // If additional uiTableId-format filters are introduced here in the future, add them
  // to the CHART_FILTER_ID_TO_VIEW_FIELD map below (the canonical view field names live
  // in dashboardUiTableToViewMapping.ts :: viewMappings["observations"]).
  const CHART_FILTER_ID_TO_VIEW_FIELD: Record<string, string> = {
    model: "providedModelName",
  };

  const nonDatetimeFilters = filter.filter((f) => f.type !== "datetime");
  // Apply standard uiTableName → view field mapping first.
  const standardMapped = mapLegacyUiTableFilterToView(
    "observations",
    nonDatetimeFilters,
  );
  // Then patch any remaining uiTableId-format columns.
  const viewFilters = standardMapped.map((f) => {
    const viewField = CHART_FILTER_ID_TO_VIEW_FIELD[f.column];
    return viewField ? { ...f, column: viewField } : f;
  });

  const q: QueryType = {
    view: "observations",
    dimensions: [{ field: dimensionField }],
    metrics: [{ measure: metricMeasure, aggregation: "sum" }],
    filters: viewFilters,
    timeDimension: { granularity: "auto" },
    fromTimestamp: new Date(from.value as Date).toISOString(),
    toTimestamp: new Date(to.value as Date).toISOString(),
    orderBy: null,
  };

  const rows = await executeQuery(projectId, q, "v2", true);

  // Transform flat rows to { intervalStart, key, sum } expected by the component.
  const sumField = `sum_${metricMeasure}`;
  return rows.map((row) => ({
    intervalStart: new Date(row["time_dimension"] as string),
    key: row[dimensionField] as string,
    sum: Number(row[sumField] ?? 0),
  })) as DatabaseRow[];
}

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        version: viewVersions.optional().default("v1"),
        queryName: z
          .enum([
            // Current score table is weird and does not fit into new model. Keep around as is until we decide what to do with it.
            "score-aggregate",
            "observations-usage-by-type-timeseries",
            "observations-cost-by-type-timeseries",
          ])
          .nullish(),
      }),
    )
    .query(async ({ input }) => {
      const [from, to] = extractFromAndToTimestampsFromFilter(input.filter);

      if (from.value && to.value && from.value > to.value) {
        logger.error(
          `from > to, returning empty result: from=${from}, to=${to}`,
        );
        return [];
      }

      switch (input.queryName) {
        case "score-aggregate":
          if (input.version === "v2") {
            return getScoreAggregateV2({
              projectId: input.projectId,
              filter: input.filter ?? [],
            });
          }
          const scores = await getScoreAggregate(
            input.projectId,
            input.filter ?? [],
          );
          return scores.map((row) => ({
            scoreName: row.name,
            scoreSource: row.source,
            scoreDataType: row.data_type,
            avgValue: row.avg_value,
            countScoreId: Number(row.count),
          })) as DatabaseRow[];
        case "observations-usage-by-type-timeseries":
          if (input.version === "v2") {
            return getObservationsByTypeV2({
              projectId: input.projectId,
              filter: input.filter ?? [],
              dimensionField: "usageType",
              metricMeasure: "usageByType",
            });
          }
          const rowsObsType = await getObservationUsageByTypeByTime(
            input.projectId,
            input.filter ?? [],
          );
          return rowsObsType as DatabaseRow[];
        case "observations-cost-by-type-timeseries":
          if (input.version === "v2") {
            return getObservationsByTypeV2({
              projectId: input.projectId,
              filter: input.filter ?? [],
              dimensionField: "costType",
              metricMeasure: "costByType",
            });
          }
          const rowsObsCostByType = await getObservationCostByTypeByTime(
            input.projectId,
            input.filter ?? [],
          );
          return rowsObsCostByType as DatabaseRow[];
        default:
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Query not found",
          });
      }
    }),
  scoreHistogram: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        version: viewVersions.optional().default("v1"),
      }),
    )
    .query(async ({ input }) => {
      if (input.version === "v2") {
        // v2: ClickHouse histogram() aggregates all matching rows server-side.
        // `input.limit` is ignored — no row-level cap is needed.
        const { fromIso, toIso, mappedFilters } = prepareScoresNumericV2Params(
          input.filter ?? [],
        );
        const histogramQuery: QueryType = {
          view: "scores-numeric",
          dimensions: [],
          metrics: [{ measure: "value", aggregation: "histogram" }],
          filters: mappedFilters,
          fromTimestamp: fromIso,
          toTimestamp: toIso,
          timeDimension: null,
          orderBy: null,
          chartConfig: { type: "HISTOGRAM", bins: 10 },
        };
        const result = await executeQuery(
          input.projectId,
          histogramQuery,
          "v2",
        );
        return clickhouseHistogramToChartData(result);
      }

      const data = await getNumericScoreHistogram(
        input.projectId,
        input.filter ?? [],
        input.limit ?? 10000,
      );
      return createHistogramData(data);
    }),
  executeQuery: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        query: customQuery,
        version: viewVersions.optional().default("v1"),
      }),
    )
    .query(async ({ input }) => {
      try {
        return executeQuery(
          input.projectId,
          input.query as QueryType,
          input.version,
          input.version === "v2",
        );
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          logger.warn("Bad request in query execution", error, {
            projectId: input.projectId,
            query: input.query,
          });
          throw error;
        }
        logger.error("Error executing query", error, {
          projectId: input.projectId,
          query: input.query,
        });
        throw error;
      }
    }),

  allDashboards: protectedProjectProcedure
    .input(ListDashboardsInput)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });

      const result = await DashboardService.listDashboards({
        projectId: input.projectId,
        limit: input.limit,
        page: input.page,
        orderBy: input.orderBy,
      });

      return result;
    }),

  getDashboard: protectedProjectProcedure
    .input(GetDashboardInput)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });

      const dashboard = await DashboardService.getDashboard(
        input.dashboardId,
        input.projectId,
      );

      if (!dashboard) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dashboard not found",
        });
      }

      return dashboard;
    }),

  createDashboard: protectedProjectProcedure
    .input(CreateDashboardInput)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      const dashboard = await DashboardService.createDashboard(
        input.projectId,
        input.name,
        input.description,
        ctx.session.user.id,
      );

      return dashboard;
    }),

  updateDashboardDefinition: protectedProjectProcedure
    .input(UpdateDashboardDefinitionInput)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      const dashboard = await DashboardService.updateDashboardDefinition(
        input.dashboardId,
        input.projectId,
        input.definition,
        ctx.session.user.id,
      );

      return dashboard;
    }),

  updateDashboardMetadata: protectedProjectProcedure
    .input(UpdateDashboardInput)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      const dashboard = await DashboardService.updateDashboard(
        input.dashboardId,
        input.projectId,
        input.name,
        input.description,
        ctx.session.user.id,
      );

      return dashboard;
    }),

  cloneDashboard: protectedProjectProcedure
    .input(CloneDashboardInput)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      // Get the source dashboard
      const sourceDashboard = await DashboardService.getDashboard(
        input.dashboardId,
        input.projectId,
      );

      if (!sourceDashboard) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Source dashboard not found",
        });
      }

      // Create a new dashboard with the same data but modified name
      const clonedDashboard = await DashboardService.createDashboard(
        input.projectId,
        `${sourceDashboard.name} (Clone)`,
        sourceDashboard.description,
        ctx.session.user.id,
        sourceDashboard.definition,
      );

      return clonedDashboard;
    }),

  updateDashboardFilters: protectedProjectProcedure
    .input(UpdateDashboardFiltersInput)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      const dashboard = await DashboardService.updateDashboardFilters(
        input.dashboardId,
        input.projectId,
        input.filters,
        ctx.session.user.id,
      );

      return dashboard;
    }),

  // Delete dashboard input schema
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        dashboardId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      await DashboardService.deleteDashboard(
        input.dashboardId,
        input.projectId,
      );

      return { success: true };
    }),
});
