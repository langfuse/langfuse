import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DEFAULT_TRACE_JOB_DELAY,
  ZodModelConfig,
  singleFilter,
  variableMapping,
  ChatMessageRole,
  paginationZod,
  type JobConfiguration,
  JobType,
  Prisma,
  TimeScopeSchema,
  JobConfigState,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  decryptAndParseExtraHeaders,
  fetchLLMCompletion,
  getQueue,
  getScoresByIds,
  logger,
  QueueName,
  QueueJobs,
  LLMApiKeySchema,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { EvalReferencedEvaluators } from "@/src/ee/features/evals/types";
import { EvaluatorStatus } from "../types";
import { traceException } from "@langfuse/shared/src/server";
import { isNotNullOrUndefined } from "@/src/utils/types";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/src/env.mjs";
import { type PrismaClient } from "@prisma/client";
import { type JobExecutionState } from "@/src/ee/features/evals/utils/job-execution-utils";

const APIEvaluatorSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  evalTemplateId: z.string(),
  scoreName: z.string(),
  targetObject: z.string(),
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  variableMapping: z.array(variableMapping),
  sampling: z.instanceof(Prisma.Decimal),
  delay: z.number(),
  status: z.nativeEnum(JobConfigState),
  jobType: z.nativeEnum(JobType),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

type APIEvaluator = z.infer<typeof APIEvaluatorSchema>;

/**
 * Use this function when pulling a list of evaluators from the database before using in the application to ensure type safety.
 * All evaluators are expected to pass the validation. If an evaluator fails validation, it will be logged to Otel.
 * @param evaluators
 * @returns list of validated evaluators
 */
const filterAndValidateDbEvaluatorList = (
  evaluators: JobConfiguration[],
  onParseError?: (error: z.ZodError) => void,
): APIEvaluator[] =>
  evaluators.reduce((acc, ts) => {
    const result = APIEvaluatorSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      console.error("Evaluator parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as APIEvaluator[]);

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
  referencedEvaluators: z
    .nativeEnum(EvalReferencedEvaluators)
    .optional()
    .default(EvalReferencedEvaluators.PERSIST),
});

const CreateEvalJobSchema = z.object({
  projectId: z.string(),
  evalTemplateId: z.string(),
  scoreName: z.string().min(1),
  target: z.string(z.enum(["trace", "dataset-run-item"])),
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  mapping: z.array(variableMapping),
  sampling: z.number().gt(0).lte(1),
  delay: z.number().gte(0).default(DEFAULT_TRACE_JOB_DELAY), // 10 seconds default
  timeScope: TimeScopeSchema,
});

const UpdateEvalJobSchema = z.object({
  scoreName: z.string().min(1).optional(),
  filter: z.array(singleFilter).optional(),
  variableMapping: z.array(variableMapping).optional(),
  sampling: z.number().gt(0).lte(1).optional(),
  delay: z.number().gte(0).optional(),
  status: z.nativeEnum(EvaluatorStatus).optional(),
  timeScope: TimeScopeSchema.optional(),
});

const fetchJobExecutionsByState = async ({
  prisma,
  projectId,
  configIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  configIds: string[];
}) => {
  return prisma.jobExecution.groupBy({
    where: {
      jobConfiguration: {
        projectId: projectId,
        jobType: "EVAL",
        id: { in: configIds },
      },
      projectId: projectId,
    },
    by: ["status", "jobConfigurationId"],
    _count: true,
  });
};

export const calculateEvaluatorFinalStatus = (
  status: string,
  timeScope: string[],
  jobExecutionsByState: JobExecutionState[],
): string => {
  // If timeScope is only "EXISTING" and there are no pending jobs and there are some jobs,
  // then the status is "FINISHED", otherwise it's the original status
  const hasPendingJobs = jobExecutionsByState.some(
    (je) => je.status === "PENDING",
  );
  const totalJobCount = jobExecutionsByState.reduce(
    (acc, je) => acc + je._count,
    0,
  );

  if (
    timeScope.length === 1 &&
    timeScope[0] === "EXISTING" &&
    !hasPendingJobs &&
    totalJobCount > 0
  ) {
    return "FINISHED";
  }

  return status;
};

export const evalRouter = createTRPCRouter({
  globalJobConfigs: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
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
      return env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT;
    }),
  counts: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
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

      const [configCount, configActiveCount, templateCount] = await Promise.all(
        [
          ctx.prisma.jobConfiguration.count({
            where: {
              projectId: input.projectId,
              jobType: "EVAL",
            },
          }),
          ctx.prisma.jobConfiguration.count({
            where: {
              projectId: input.projectId,
              jobType: "EVAL",
              status: "ACTIVE",
            },
          }),
          ctx.prisma.evalTemplate.count({
            where: {
              projectId: input.projectId,
            },
          }),
        ],
      );

      return {
        configCount,
        configActiveCount,
        templateCount,
      };
    }),
  allConfigs: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
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

      const jobExecutionsByState = await fetchJobExecutionsByState({
        prisma: ctx.prisma,
        projectId: input.projectId,
        configIds: configs.map((c) => c.id),
      });

      return {
        configs: configs.map((config) => ({
          ...config,
          jobExecutionsByState: jobExecutionsByState.filter(
            (je) => je.jobConfigurationId === config.id,
          ),
          finalStatus: calculateEvaluatorFinalStatus(
            config.status,
            Array.isArray(config.timeScope) ? config.timeScope : [],
            jobExecutionsByState.filter(
              (je) => je.jobConfigurationId === config.id,
            ),
          ),
        })),
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

      if (!config) return null;

      const jobExecutionsByState = await fetchJobExecutionsByState({
        prisma: ctx.prisma,
        projectId: input.projectId,
        configIds: [config.id],
      });

      const finalStatus = calculateEvaluatorFinalStatus(
        config.status,
        Array.isArray(config.timeScope) ? config.timeScope : [],
        jobExecutionsByState,
      );

      return {
        ...config,
        jobExecutionsByState: jobExecutionsByState,
        finalStatus,
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

  // to be deprecated, only kept for cases of client side caching of routes
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

  jobConfigsByTarget: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), targetObject: z.string() }))
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

      const evaluators = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          targetObject: input.targetObject,
          status: "ACTIVE",
        },
      });

      return filterAndValidateDbEvaluatorList(evaluators, traceException);
    }),

  jobConfigsByTemplateName: protectedProjectProcedure
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
    .input(CreateEvalJobSchema)
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

        const jobId = uuidv4();
        await auditLog({
          session: ctx.session,
          resourceType: "job",
          resourceId: jobId,
          action: "create",
        });

        const job = await ctx.prisma.jobConfiguration.create({
          data: {
            id: jobId,
            projectId: input.projectId,
            jobType: "EVAL",
            evalTemplateId: input.evalTemplateId,
            scoreName: input.scoreName,
            targetObject: input.target,
            filter: input.filter ?? [],
            variableMapping: input.mapping,
            sampling: input.sampling,
            delay: input.delay,
            status: "ACTIVE",
            timeScope: input.timeScope,
          },
        });

        if (input.timeScope.includes("EXISTING")) {
          logger.info(
            `Applying to historical traces for job ${job.id} and project ${input.projectId}`,
          );
          const batchJobQueue = getQueue(QueueName.BatchActionQueue);
          if (!batchJobQueue) {
            throw new Error("Batch job queue not found");
          }
          await batchJobQueue.add(
            QueueJobs.BatchActionProcessingJob,
            {
              name: QueueJobs.BatchActionProcessingJob,
              timestamp: new Date(),
              id: uuidv4(),
              payload: {
                projectId: input.projectId,
                actionId: "eval-create",
                configId: job.id,
                cutoffCreatedAt: new Date(),
                targetObject: input.target,
                query: {
                  where: input.filter ?? [],
                  orderBy: {
                    column: "timestamp",
                    order: "DESC",
                  },
                },
              },
            },
            { delay: input.delay },
          );
        }
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
        (
          await fetchLLMCompletion({
            streaming: false,
            apiKey: decrypt(parsedKey.data.secretKey), // decrypt the secret key
            extraHeaders: decryptAndParseExtraHeaders(
              parsedKey.data.extraHeaders,
            ),
            baseURL: parsedKey.data.baseURL ?? undefined,
            messages: [{ role: ChatMessageRole.User, content: input.prompt }],
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
          })
        ).completion;
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
        config: UpdateEvalJobSchema,
      }),
    )
    .mutation(async ({ ctx, input: { config, projectId, evalConfigId } }) => {
      throwIfNoEntitlement({
        entitlement: "model-based-evaluations",
        projectId: projectId,
        sessionUser: ctx.session.user,
      });
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evalJob:CUD",
      });

      const existingJob = await ctx.prisma.jobConfiguration.findUnique({
        where: {
          id: evalConfigId,
          projectId: projectId,
        },
      });

      if (!existingJob) {
        logger.warn(
          `Job for update not found for project ${projectId} and id ${evalConfigId}`,
        );
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      if (
        // check if:
        // - existing job ran on existing traces
        // - user wants to update the time scope
        // - new time scope does not include EXISTING
        existingJob.timeScope.includes("EXISTING") &&
        config.timeScope &&
        !config.timeScope.includes("EXISTING")
      ) {
        logger.error(
          `Job ${evalConfigId} for project ${projectId} ran on existing traces already. This cannot be changed anymore`,
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The evaluator ran on existing traces already. This cannot be changed anymore.",
        });
      }

      if (
        existingJob.timeScope.includes("EXISTING") &&
        !existingJob.timeScope.includes("NEW") &&
        config.status === "INACTIVE"
      ) {
        logger.error(
          `Job ${evalConfigId} for project ${projectId} is running on existing traces only and cannot be deactivated`,
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The evaluator is running on existing traces only and cannot be deactivated.",
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: "job",
        resourceId: evalConfigId,
        action: "update",
      });

      const updatedJob = await ctx.prisma.jobConfiguration.update({
        where: {
          id: evalConfigId,
          projectId: projectId,
        },
        data: config,
      });

      if (config.timeScope?.includes("EXISTING")) {
        logger.info(
          `Applying to historical traces for job ${evalConfigId} and project ${projectId}`,
        );
        const batchJobQueue = getQueue(QueueName.BatchActionQueue);
        if (!batchJobQueue) {
          throw new Error("Batch job queue not found");
        }
        await batchJobQueue.add(
          QueueJobs.BatchActionProcessingJob,
          {
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            id: uuidv4(),
            payload: {
              projectId: projectId,
              actionId: "eval-create",
              configId: evalConfigId,
              cutoffCreatedAt: new Date(),
              targetObject: existingJob?.targetObject,
              query: {
                where: config.filter ?? [],
                orderBy: {
                  column: "timestamp",
                  order: "DESC",
                },
              },
            },
          },
          { delay: config.delay },
        );
      }

      return updatedJob;
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
          jobOutputScoreId: true,
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

      const scoreIds = jobExecutions
        .map((je) => je.jobOutputScoreId)
        .filter(isNotNullOrUndefined);

      const scores =
        scoreIds.length > 0
          ? await getScoresByIds(input.projectId, scoreIds)
          : [];

      return {
        data: jobExecutions.map((je) => ({
          ...je,
          score: scores.find((s) => s?.id === je.jobOutputScoreId),
        })),
        totalCount: count,
      };
    }),

  jobConfigsByDatasetId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
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

      // Get all evaluators (jobConfigs) for the project, refactor to reuse filter builder pattern in lfe-2887
      const evaluators = await ctx.prisma.$queryRaw<
        Array<{
          id: string;
          scoreName: string;
        }>
      >(Prisma.sql`
      SELECT DISTINCT
        jc.id, 
        jc.score_name as "scoreName"
      FROM 
        "job_configurations" as jc
      WHERE 
        jc.project_id = ${input.projectId}
        AND jc.job_type = 'EVAL'
        AND jc.target_object = 'dataset'
        AND jc.status = 'ACTIVE'
        AND (
          jc.filter IS NULL 
          OR jsonb_array_length(jc.filter) = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(jc.filter) as f
            WHERE f->>'column' = 'Dataset'
              AND f->>'type' = 'stringOptions'
              AND (
                (f->>'operator' = 'any of' AND ${Prisma.sql`${input.datasetId}`}::text = ANY(SELECT jsonb_array_elements_text(f->'value')))
                OR 
                (f->>'operator' = 'none of' AND NOT (${Prisma.sql`${input.datasetId}`}::text = ANY(SELECT jsonb_array_elements_text(f->'value'))))
              )
          )
        )
      `);

      return evaluators;
    }),
});
