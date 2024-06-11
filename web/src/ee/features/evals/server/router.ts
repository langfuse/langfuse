import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DEFAULT_TRACE_JOB_DELAY, EvalTargetObject } from "@langfuse/shared";
import {
  ZodModelConfig,
  singleFilter,
  variableMapping,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";

export const CreateEvalTemplate = z.object({
  name: z.string().min(1),
  projectId: z.string(),
  prompt: z.string(),
  provider: z.string(),
  model: z.string(),
  modelParams: ZodModelConfig,
  vars: z.array(z.string()),
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
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }

      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const configs = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
        },
        include: {
          evalTemplate: true,
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

  configById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const config = await ctx.prisma.jobConfiguration.findUnique({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        include: {
          evalTemplate: true,
        },
      });

      return config;
    }),

  allTemplatesForName: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
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
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
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
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
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
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
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
        scoreName: z.string().min(1),
        target: z.string(),
        filter: z.array(singleFilter).nullable(), // re-using the filter type from the tables
        mapping: z.array(variableMapping),
        sampling: z.number().gte(0).lte(1),
        delay: z.number().gte(0).default(DEFAULT_TRACE_JOB_DELAY), // 10 seconds default
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
          throw new Error("Evals available in cloud only");
        }
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "evalJob:CUD",
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
            delay: input.delay,
            status: "ACTIVE",
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
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
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
          modelParams: input.modelParams,
          vars: input.vars,
          outputSchema: input.outputSchema,
          provider: input.provider,
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

  updateEvalJob: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evalConfigId: z.string(),
        updatedStatus: z.enum(["ACTIVE", "INACTIVE"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      await ctx.prisma.jobConfiguration.update({
        where: {
          id: input.evalConfigId,
          projectId: input.projectId,
        },
        data: {
          status: input.updatedStatus,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "job",
        resourceId: input.evalConfigId,
        action: "update",
      });
    }),

  getLogs: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().optional(),
        page: z.number().optional(),
        jobConfigurationId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) {
        throw new Error("Evals available in cloud only");
      }
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const jobExecutions = await ctx.prisma.jobExecution.findMany({
        where: {
          projectId: input.projectId,
          status: {
            not: "CANCELLED",
          },
          ...(input.jobConfigurationId
            ? { jobConfigurationId: input.jobConfigurationId }
            : undefined),
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
          jobConfigurationId: true,
          status: true,
          startTime: true,
          endTime: true,
          error: true,
          jobInputTraceId: true,
          score: true,
          jobConfiguration: {
            select: {
              evalTemplateId: true,
            },
          },
        },
        ...(input.limit !== undefined && input.page !== undefined
          ? { take: input.limit, skip: input.page * input.limit }
          : undefined),
        orderBy: {
          createdAt: "desc",
        },
      });
      const count = await ctx.prisma.jobExecution.count({
        where: {
          projectId: input.projectId,
          status: {
            not: "CANCELLED",
          },
          ...(input.jobConfigurationId
            ? { jobConfigurationId: input.jobConfigurationId }
            : undefined),
        },
      });
      return {
        data: jobExecutions,
        totalCount: count,
      };
    }),
});
