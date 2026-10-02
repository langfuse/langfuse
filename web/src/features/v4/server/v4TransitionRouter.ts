import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";
import {
  getAccessibleOrganizationProjects,
  getProjectV4MigrationData,
  getMigrationActions,
  getLegacyApiUsageSummaries,
  getLegacyIntegrationSummaries,
  getSdkUsageSummaries,
  getTraceLevelEvalSummaries,
} from "@/src/features/v4/server/v4TransitionService";

export const v4TransitionRouter = createTRPCRouter({
  forceV3Experience: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => isForceV3ExperienceProject(input.projectId)),

  migrationData: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      getProjectV4MigrationData({
        prisma: ctx.prisma,
        projectId: input.projectId,
      }),
    ),

  summary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [summary] = await getLegacyIntegrationSummaries({
        prisma: ctx.prisma,
        projectIds: [input.projectId],
      });
      return summary!;
    }),

  traceLevelEvalSummary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [summary] = await getTraceLevelEvalSummaries({
        prisma: ctx.prisma,
        projectIds: [input.projectId],
      });
      return summary!;
    }),

  summaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) {
        return { projects: [] };
      }
      const summaries = await getLegacyIntegrationSummaries({
        prisma: ctx.prisma,
        projectIds,
      });
      const summaryByProjectId = new Map(
        summaries.map((summary) => [summary.projectId, summary]),
      );

      return {
        projects: projects.map((project) => {
          const summary = summaryByProjectId.get(project.id)!;
          return {
            ...summary,
            projectName: project.name,
            forceV3Experience: isForceV3ExperienceProject(project.id),
          };
        }),
      };
    }),

  traceLevelEvalSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      const projectIds = projects.map((project) => project.id);
      return getTraceLevelEvalSummaries({
        prisma: ctx.prisma,
        projectIds,
      });
    }),

  sdkUsageSummary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const [summary] = await getSdkUsageSummaries({
        projectIds: [input.projectId],
      });
      return summary!;
    }),

  sdkUsageSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getSdkUsageSummaries({
        projectIds: projects.map((project) => project.id),
      });
    }),

  legacyApiUsageSummary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) =>
      getLegacyApiUsageSummaries({
        projectIds: [input.projectId],
      }),
    ),

  legacyApiUsageSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getLegacyApiUsageSummaries({
        projectIds: projects.map((project) => project.id),
      });
    }),

  /**
   * Migration signal for always-mounted UI (the sidebar "Action required"
   * pill). Postgres for eval/export signals; SDK via the same Redis + live
   * gap-fill path as sdkUsageSummary. Deprecated API / experiment signals
   * read worker-maintained Redis entries when available (miss = unknown/none).
   */
  migrationActions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      getMigrationActions({
        prisma: ctx.prisma,
        projectId: input.projectId,
      }),
    ),
});
