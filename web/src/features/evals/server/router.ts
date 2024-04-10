import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DEFAULT_TRACE_JOB_DELAY, EvalTargetObject } from "@langfuse/shared";
import {
  EvalModelNames,
  ZodModelConfig,
  singleFilter,
  variableMapping,
} from "@langfuse/shared";
import lodash from "lodash";

export const CreateEvalTemplate = z.object({
  name: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  model: EvalModelNames,
  modelParameters: ZodModelConfig,
  variables: z.array(z.string()),
  outputSchema: z.object({
    score: z.string(),
    reasoning: z.string(),
  }),
});

export const evalRouter = createTRPCRouter({
  allConfigs: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number(),
        page: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "job:read",
      });

      const configs = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      const count = await ctx.prisma.jobConfiguration.count({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
        },
      });
      return {
        configs: configs,
        totalCount: count,
      };
    }),

  allTemplatesForName: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        orderBy: [{ version: "desc" }],
      });

      return {
        templates: templates,
      };
    }),

  templateNames: protectedProjectProcedure
    .input(
      z.object({ projectId: z.string(), page: z.number(), limit: z.number() }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const templates = await ctx.prisma.$queryRaw<
        Array<{
          name: string;
          version: number;
          latestCreatedAt: Date;
          latestId: string;
        }>
      >`
        SELECT
          name,
          MAX(version) as version,
          MAX(created_at) as "latestCreatedAt",
          (SELECT id FROM "eval_templates" WHERE "project_id" = ${input.projectId} AND name = et.name ORDER BY version DESC LIMIT 1) as "latestId"
        FROM "eval_templates" as et
        WHERE "project_id" = ${input.projectId}
        GROUP BY name
        ORDER BY name
        LIMIT ${input.limit}
        OFFSET ${input.page * input.limit}
      `;
      return {
        templates: templates,
        totalCount: templates.length,
      };
    }),

  templateById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const template = await ctx.prisma.evalTemplate.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      return template;
    }),

  allTemplates: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string().optional(),
        limit: z.number().optional(),
        page: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          projectId: input.projectId,
          ...(input.id ? { id: input.id } : undefined),
        },
        ...(input.limit && input.page
          ? { take: input.limit, skip: input.page * input.limit }
          : undefined),
      });

      const count = await ctx.prisma.evalTemplate.count({
        where: {
          projectId: input.projectId,
          ...(input.id ? { id: input.id } : undefined),
        },
      });
      return {
        templates: templates,
        totalCount: count,
      };
    }),

  createJob: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evalTemplateId: z.string(),
        scoreName: z.string(),
        target: z.string(),
        filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
        mapping: z.array(variableMapping),
        sampling: z.number().gte(0).lte(1),
        delay: z.number().gte(0).default(10_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "job:create",
        });

        const evalTemplate = await ctx.prisma.evalTemplate.findUnique({
          where: {
            id: input.evalTemplateId,
            projectId: input.projectId,
          },
        });

        if (!evalTemplate) {
          console.log(
            `Template not found for project ${input.projectId} and id ${input.evalTemplateId}`,
          );
          throw new Error("Template not found");
        }

        const job = await ctx.prisma.jobConfiguration.create({
          data: {
            projectId: input.projectId,
            jobType: "EVAL",
            evalTemplateId: input.evalTemplateId,
            scoreName: input.scoreName,
            targetObject: EvalTargetObject.Trace,
            filter: input.filter ?? [],
            variableMapping: input.mapping,
            sampling: input.sampling,
            delay: DEFAULT_TRACE_JOB_DELAY, // 10 seconds default
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "job",
          resourceId: job.id,
          action: "create",
        });
      } catch (e) {
        console.log(e);
        throw e;
      }
    }),
  createTemplate: protectedProjectProcedure
    .input(CreateEvalTemplate)
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:create",
      });

      const latestTemplate = await ctx.prisma.evalTemplate.findFirst({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        orderBy: [{ version: "desc" }],
      });

      const evalTemplate = await ctx.prisma.evalTemplate.create({
        data: {
          version: latestTemplate?.version ? latestTemplate.version + 1 : 1,
          name: input.name,
          projectId: input.projectId,
          prompt: input.prompt,
          model: input.model,
          modelParams: input.modelParameters,
          vars: input.variables,
          outputSchema: input.outputSchema,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "evalTemplate",
        resourceId: evalTemplate.id,
        action: "create",
      });
      return evalTemplate;
    }),
});
