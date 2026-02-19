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
} from "@/src/features/query/types";
import {
  paginationZod,
  orderBy,
  StringNoHTML,
  InvalidRequestError,
  singleFilter,
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

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(
      sqlInterface.extend({
        projectId: z.string(),
        filter: filterInterface.optional(),
        queryName: z
          .enum([
            // Current score table is weird and does not fit into new model. Keep around as is until we decide what to do with it.
            "score-aggregate",
            // Cost by type and usage by type are currently not supported in the new data model.
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
          const rowsObsType = await getObservationUsageByTypeByTime(
            input.projectId,
            input.filter ?? [],
          );
          return rowsObsType as DatabaseRow[];
        case "observations-cost-by-type-timeseries":
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
      }),
    )
    .query(async ({ input }) => {
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
      }),
    )
    .query(async ({ input }) => {
      try {
        return executeQuery(input.projectId, input.query as QueryType);
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
