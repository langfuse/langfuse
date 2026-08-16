import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";
import {
  getAccessibleOrganizationProjects,
  getLegacyApiUsageSummaries,
  getLegacyIntegrationSummaries,
  getSdkUsageSummaries,
  getTraceLevelEvalSummaries,
} from "@/src/features/v4/server/v4TransitionService";

const MAX_DETECTION_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

const projectTimeRangeInputSchema = z
  .object({
    projectId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_DETECTION_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
  );

const organizationTimeRangeInputSchema = z
  .object({
    orgId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_DETECTION_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
  );

export const v4TransitionRouter = createTRPCRouter({
  forceV3Experience: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => isForceV3ExperienceProject(input.projectId)),

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
    .input(projectTimeRangeInputSchema)
    .query(async ({ input }) => {
      const [summary] = await getSdkUsageSummaries({
        projectIds: [input.projectId],
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
      return summary!;
    }),

  sdkUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getSdkUsageSummaries({
        projectIds: projects.map((project) => project.id),
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
    }),

  legacyApiUsageSummary: protectedProjectProcedure
    .input(projectTimeRangeInputSchema)
    .query(({ input }) =>
      getLegacyApiUsageSummaries({
        projectIds: [input.projectId],
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      }),
    ),

  legacyApiUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getLegacyApiUsageSummaries({
        projectIds: projects.map((project) => project.id),
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
    }),
});
