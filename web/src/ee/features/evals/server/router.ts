import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DEFAULT_TRACE_JOB_DELAY,
  EvalTargetObject,
  ZodModelConfig,
  singleFilter,
  variableMapping,
  ChatMessageRole,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  fetchLLMCompletion,
  LLMApiKeySchema,
  logger,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { EvalReferencedEvaluators } from "@/src/ee/features/evals/types";

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
  referencedEvaluators: z.nativeEnum(EvalReferencedEvaluators),
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });

      throwIfNoProjectAccess({
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
        orderBy: {
          status: "asc",
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
  evaluatorsByTemplateName: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateName: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "model-based-evaluations",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "evalJob:read",
        });

        const templates = await ctx.prisma.evalTemplate.findMany({
          where: {
            projectId: input.projectId,
            name: input.evalTemplateName,
          },
          select: {
            id: true,
          },
        });

        return {
          evaluators: await ctx.prisma.jobConfiguration.findMany({
            where: {
              projectId: input.projectId,
              evalTemplateId: { in: templates.map((t) => t.id) },
            },
          }),
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching eval jobs for template failed.",
        });
      }
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
        throwIfNoEntitlement({
          entitlement: "model-based-evaluations",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });
        throwIfNoProjectAccess({
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
          logger.warn(
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
        logger.error(e);
        throw e;
      }
    }),
  createTemplate: protectedProjectProcedure
    .input(CreateEvalTemplate)
    .mutation(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:create",
      });

      const matchingLLMKey = await ctx.prisma.llmApiKeys.findFirst({
        where: {
          projectId: input.projectId,
          provider: input.provider,
        },
      });

      const parsedKey = LLMApiKeySchema.safeParse(matchingLLMKey);

      if (!matchingLLMKey || !parsedKey.success) {
        throw new Error("No matching LLM key found for provider");
      }

      // Make a test structured output call to validate the LLM key
      try {
        await fetchLLMCompletion({
          streaming: false,
          apiKey: decrypt(parsedKey.data.secretKey), // decrypt the secret key
          baseURL: parsedKey.data.baseURL ?? undefined,
          messages: [
            {
              role: ChatMessageRole.System,
              content: "You are an expert at evaluating LLM outputs.",
            },
            { role: ChatMessageRole.User, content: input.prompt },
          ],
          modelParams: {
            provider: input.provider,
            model: input.model,
            adapter: parsedKey.data.adapter,
            ...input.modelParams,
          },
          structuredOutputSchema: z.object({
            score: z.string(),
            reasoning: z.string(),
          }),
          config: parsedKey.data.config,
        });
      } catch (err) {
        logger.error(err);

        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Selected model is not supported for evaluations. Test tool call failed.",
        });
      }

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          projectId: input.projectId,
          name: input.name,
        },
        orderBy: [{ version: "desc" }],
        select: {
          id: true,
          version: true,
        },
      });
      const latestTemplate = Boolean(templates.length)
        ? templates[0]
        : undefined;

      const evalTemplate = await ctx.prisma.evalTemplate.create({
        data: {
          version: (latestTemplate?.version ?? 0) + 1,
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

      if (
        input.referencedEvaluators === EvalReferencedEvaluators.UPDATE &&
        Boolean(templates.length)
      ) {
        await ctx.prisma.jobConfiguration.updateMany({
          where: {
            evalTemplateId: { in: templates.map((t) => t.id) },
          },
          data: {
            evalTemplateId: evalTemplate.id,
          },
        });
      }

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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
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
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJobExecution:read",
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
