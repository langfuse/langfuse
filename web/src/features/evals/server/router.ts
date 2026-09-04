import { z } from "zod";
import {
  authenticatedProcedure,
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DEFAULT_TRACE_JOB_DELAY,
  deriveEvaluatorDisplayStateFromExecutionCounts,
  singleFilter,
  variableMapping,
  observationVariableMapping,
  paginationZod,
  Prisma,
  JobTimeScopeZod,
  TimeScopeSchema,
  JobConfigState,
  orderBy,
  EvalTargetObject,
  EvalTargetObjectSchema,
  validateEvaluatorFiltersForTarget,
  InvalidRequestError,
  LangfuseNotFoundError,
  EvalTemplateType,
  type EvaluatorExecutionStatusCount,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";
import {
  getQueue,
  getAvgCostByEvaluatorIds,
  getAvgCostByEvaluatorIdsFromObservations,
  getCostByEvaluatorIds,
  getTotalCostByRule,
  getEvaluatorExecutionStatusCountsByEvaluatorId,
  getScoresByIds,
  logger,
  QueueName,
  QueueJobs,
  tableColumnsToSqlFilterAndPrefix,
  invalidateProjectEvalConfigCaches,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { EvaluatorStatus } from "../types";
import { assertUnreachable, isNotNullOrUndefined } from "@/src/utils/types";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/src/env.mjs";
import { type JobExecution, type PrismaClient } from "@prisma/client";
import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";
import {
  selectDatasetEvaluatorsForStatusChange,
  shouldValidateBeforeActivation,
} from "@/src/features/evals/server/evalConfigState";
import {
  EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
  JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
} from "@/src/features/evals/server/audit-log-resource-types";
import {
  CodeEvalTestRunSetupError,
  runCodeEvalTest,
} from "@/src/features/evals/server/codeEvalTestRun";
import {
  CreateEvalTemplateInputSchema,
  validateEvalTemplateCreation,
} from "@/src/features/evals/server/evalTemplateCreation";
import {
  getCodeEvalCapabilities,
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import {
  assertCodeEvalJobConfigCanRun,
  CodeEvalJobConfigError,
} from "@/src/features/evals/server/codeEvalJobConfigValidation";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";
import { assertCanCreateLegacyEvalJob } from "@/src/features/evals/server/legacyEvalGate";
import { LegacyEvalCompatibilityService } from "@/src/features/evals/server/legacyCompatibilityService";
import { reconcileEvaluatorPromptMessages } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
export { CreateEvalTemplateInputSchema } from "@/src/features/evals/server/evalTemplateCreation";

// Filter columns that used to be backed by the Postgres `traces` and
// `scores` JOINs.  Those tables now live in ClickHouse, so the eval logs
// query can no longer resolve them.  Filters referencing these columns are
// dropped server-side to keep bookmarked URLs from failing.
const DEPRECATED_FILTER_COLUMNS = new Set(["scoreValue", "sessionId"]);

const CreateEvalJobSchema = z.object({
  projectId: z.string(),
  evalTemplateId: z.string(),
  scoreName: z.string().min(1),
  target: EvalTargetObjectSchema,
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  // Accept either full variableMapping (trace/dataset) or simplified observationVariableMapping (event/experiment)
  mapping: z.union([
    z.array(variableMapping),
    z.array(observationVariableMapping),
  ]),
  sampling: z.number().gt(0).lte(1),
  delay: z.number().gte(0).default(DEFAULT_TRACE_JOB_DELAY), // 10 seconds default
  timeScope: TimeScopeSchema,
  status: z.enum(EvaluatorStatus).optional().default(JobConfigState.ACTIVE),
  sourceRuleId: z.string().optional(),
  sourceRuleAction: z.enum(["mark-inactive", "delete"]).optional(),
});

const CodeEvalTestRunSchema = z.object({
  projectId: z.string(),
  evalTemplateId: z.string(),
  target: z.union([
    z.literal(EvalTargetObject.EVENT),
    z.literal(EvalTargetObject.EXPERIMENT),
  ]),
  mapping: z.array(observationVariableMapping),
  scoreName: z.string().min(1),
  observationId: z.string(),
  traceId: z.string(),
  startTime: z.coerce.date(),
  shouldReadFromObservationsTable: z.boolean().optional().default(false),
});

const assertCodeEvalEnabled = () => {
  if (!isCodeEvalEnabled()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Code evals are not enabled",
    });
  }
};

const assertCodeEvalTemplateCanRun = (params: {
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
}) => {
  assertCodeEvalEnabled();

  if (!isCodeEvalSourceCodeLanguageSupported(params.sourceCodeLanguage)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This code evaluator language is not supported by the configured dispatcher.",
    });
  }
};

function toCodeEvalJobConfigTRPCError(error: CodeEvalJobConfigError) {
  switch (error.code) {
    case "invalid_target":
    case "invalid_request":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    case "resource_not_found":
      return new TRPCError({
        code: "NOT_FOUND",
        message: error.message,
      });
    case "preflight_failed":
      return new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
      });
    default:
      return assertUnreachable(error.code);
  }
}

/**
 * Runs the code evaluator against a matching sample before it is saved, so a
 * broken mapping surfaces in the editor instead of in the execution log.
 */
const assertCodeEvalJobConfigCanRunForTRPC = async (params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObject;
  mapping: unknown;
  scoreName: string;
  filter: z.infer<typeof singleFilter>[] | null;
}) => {
  try {
    await assertCodeEvalJobConfigCanRun(params);
  } catch (error) {
    if (error instanceof CodeEvalJobConfigError) {
      throw toCodeEvalJobConfigTRPCError(error);
    }

    throw error;
  }
};

/**
 * Activation guard: a legacy configuration must not go live while its model
 * configuration cannot actually run.
 */
const assertTemplateCanRunForActivation = async (params: {
  projectId: string;
  template: {
    name: string;
    type: EvalTemplateType;
    provider: string | null;
    model: string | null;
    modelParams: unknown;
    outputDefinition: unknown;
  };
}) => {
  const error = await getEvaluatorDefinitionPreflightError({
    projectId: params.projectId,
    template: params.template,
  });

  if (error) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: error });
  }
};

const UpdateEvalJobSchema = z.object({
  scoreName: z.string().min(1).optional(),
  filter: z.array(singleFilter).optional(),
  // Accept either full variableMapping (trace/dataset) or simplified observationVariableMapping (event/experiment)
  variableMapping: z
    .union([z.array(variableMapping), z.array(observationVariableMapping)])
    .optional(),
  sampling: z.number().gt(0).lte(1).optional(),
  delay: z.number().gte(0).optional(),
  status: z.enum(EvaluatorStatus).optional(),
  timeScope: z.array(JobTimeScopeZod).optional(),
});

const validateVariableMappingForTarget = ({
  targetObject,
  mapping,
}: {
  targetObject: string;
  mapping: unknown;
}) => {
  const result =
    targetObject === EvalTargetObject.EVENT ||
    targetObject === EvalTargetObject.EXPERIMENT
      ? z.array(observationVariableMapping).safeParse(mapping)
      : targetObject === EvalTargetObject.TRACE ||
          targetObject === EvalTargetObject.DATASET
        ? z.array(variableMapping).safeParse(mapping)
        : null;

  if (!result?.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Variable mapping does not match evaluator target.",
    });
  }

  return result.data;
};

function toCodeEvalTRPCError(error: CodeEvalTestRunSetupError) {
  switch (error.code) {
    case "TEMPLATE_NOT_FOUND":
      return new TRPCError({
        code: "NOT_FOUND",
        message: error.message,
      });
    case "UNSUPPORTED_LANGUAGE":
    case "INVALID_TARGET":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    case "DISPATCHER_NOT_CONFIGURED":
      return new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
      });
    default:
      return assertUnreachable(error.code);
  }
}

export const evalRouter = createTRPCRouter({
  codeEvalCapabilities: authenticatedProcedure.query(() =>
    getCodeEvalCapabilities(),
  ),

  globalJobConfigs: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });
      return env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT;
    }),
  counts: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      return new LegacyEvalCompatibilityService(ctx.prisma).counts(
        input.projectId,
      );
    }),
  allConfigs: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(), // Required for protectedProjectProcedure
        filter: z.array(singleFilter),
        orderBy: orderBy,
        searchQuery: z.string().nullish(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });
      const result = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).listConfigs({
        projectId: input.projectId,
        page: input.page,
        limit: input.limit,
        filter: input.filter,
        orderBy: input.orderBy,
        searchQuery: input.searchQuery,
      });
      return {
        ...result,
        configs: result.configs.map((config) => ({
          ...config,
          displayStatus: deriveEvaluatorDisplayStateFromExecutionCounts({
            status: config.status,
            blockedAt: config.blockedAt,
            timeScope: config.timeScope,
            executionCounts: [],
          }),
        })),
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      const config = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).getConfig(input.projectId, input.id);

      if (!config) return null;

      const displayStatus = deriveEvaluatorDisplayStateFromExecutionCounts({
        status: config.status,
        blockedAt: config.blockedAt,
        timeScope: Array.isArray(config.timeScope) ? config.timeScope : [],
      });

      return {
        ...config,
        displayStatus,
      };
    }),

  allTemplatesForName: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        isUserManaged: z.boolean().default(true),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:read",
      });

      const service = new LegacyEvalCompatibilityService(ctx.prisma);
      const templates = input.isUserManaged
        ? await service.listTemplateVersions(input.projectId, input.name)
        : service
            .listManagedTemplates()
            .filter((template) => template.name === input.name);

      return {
        templates: templates,
      };
    }),

  templateNames: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        page: z.number(),
        limit: z.number(),
        searchQuery: z.string().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:read",
      });

      return new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).listTemplateFamilies(input);
    }),

  templateById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:read",
      });

      return new LegacyEvalCompatibilityService(ctx.prisma).getTemplate(
        input.projectId,
        input.id,
      );
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:read",
      });

      const service = new LegacyEvalCompatibilityService(ctx.prisma);
      const allTemplates = input.id
        ? [await service.getTemplate(input.projectId, input.id)].filter(
            isNotNullOrUndefined,
          )
        : await service.listTemplates(input.projectId);
      const start =
        input.limit !== undefined && input.page !== undefined
          ? input.page * input.limit
          : 0;
      const templates =
        input.limit !== undefined
          ? allTemplates.slice(start, start + input.limit)
          : allTemplates;
      return {
        templates,
        totalCount: allTemplates.length,
      };
    }),

  latestTemplates: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().optional(),
        page: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:read",
      });

      const latestTemplates = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).listTemplates(input.projectId, { collapseManagedCopies: true });

      const start =
        input.limit !== undefined && input.page !== undefined
          ? input.page * input.limit
          : undefined;

      return {
        templates:
          start !== undefined && input.limit !== undefined
            ? latestTemplates.slice(start, start + input.limit)
            : latestTemplates,
        totalCount: latestTemplates.length,
      };
    }),

  // to be deprecated, only kept for cases of client side caching of routes
  evaluatorsByTemplateName: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateName: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      return {
        evaluators: await new LegacyEvalCompatibilityService(
          ctx.prisma,
        ).listConfigsByTemplateName(input.projectId, input.evalTemplateName),
      };
    }),

  jobConfigsByTarget: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetObject: z.union([z.array(z.string()), z.string()]),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      const targetObjects = Array.isArray(input.targetObject)
        ? input.targetObject
        : [input.targetObject];

      const { configs } = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).listConfigs({
        projectId: input.projectId,
        targetObjects,
      });
      return configs;
    }),

  jobConfigsByTemplateName: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateName: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      return {
        evaluators: await new LegacyEvalCompatibilityService(
          ctx.prisma,
        ).listConfigsByTemplateName(input.projectId, input.evalTemplateName),
      };
    }),

  createJob: protectedProjectProcedure
    .input(CreateEvalJobSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:CUD",
      });

      assertCanCreateLegacyEvalJob({
        projectId: input.projectId,
        target: input.target,
      });

      const variableMappingForTarget = validateVariableMappingForTarget({
        targetObject: input.target,
        mapping: input.mapping,
      });
      const filterValidation = validateEvaluatorFiltersForTarget({
        targetObject: input.target,
        filter: input.filter ?? [],
      });
      if (!filterValidation.isValid) {
        throw new InvalidRequestError(
          filterValidation.issues[0]?.message ??
            "Evaluator filters are invalid. Remove unsupported or incomplete filters and try again.",
        );
      }
      const validatedFilter = filterValidation.validatedFilters;

      const compatibility = new LegacyEvalCompatibilityService(ctx.prisma);
      const template = await compatibility.getTemplate(
        input.projectId,
        input.evalTemplateId,
      );
      if (!template) {
        throw new LangfuseNotFoundError("Evaluator template not found");
      }
      if (template.type === EvalTemplateType.CODE) {
        assertCodeEvalTemplateCanRun({
          sourceCodeLanguage: template.sourceCodeLanguage,
        });
        await assertCodeEvalJobConfigCanRunForTRPC({
          prisma: ctx.prisma,
          orgId: ctx.session.orgId,
          projectId: input.projectId,
          evalTemplateId: input.evalTemplateId,
          target: input.target,
          mapping: variableMappingForTarget,
          scoreName: input.scoreName,
          filter: validatedFilter ?? [],
        });
      }

      const job = await compatibility.createConfig({
        projectId: input.projectId,
        templateId: input.evalTemplateId,
        scoreName: input.scoreName,
        targetObject: input.target,
        filter: validatedFilter ?? [],
        variableMapping: variableMappingForTarget,
        sampling: input.sampling,
        delay: input.delay,
        status: input.status,
        timeScope: input.timeScope,
        createdByUserId: ctx.session.user?.id ?? null,
        reuseEvaluatorFromRuleId: input.sourceRuleId,
        sourceRuleAction: input.sourceRuleAction,
      });
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Evaluator not found",
        });
      }
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: job.id,
        action: "create",
      });
      if (input.sourceRuleId) {
        await auditLog({
          session: ctx.session,
          resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: input.sourceRuleId,
          action: input.sourceRuleAction === "delete" ? "delete" : "update",
        });
      }

      // Clear the "no job configs" caches only if the new config is ACTIVE
      if (input.status === JobConfigState.ACTIVE) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }

      // EVENT targets handle historical evaluation via the dedicated batch
      // "Run Evaluation" action (runEvaluationRouter), so we only schedule
      // historical backfills here for TRACE and DATASET targets.
      if (
        input.timeScope.includes("EXISTING") &&
        (input.target === EvalTargetObject.TRACE ||
          input.target === EvalTargetObject.DATASET)
      ) {
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
                filter: validatedFilter,
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

      return { id: job.id };
    }),
  testRunCodeEval: protectedProjectProcedure
    .input(CodeEvalTestRunSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:CUD",
      });

      assertCodeEvalEnabled();

      validateVariableMappingForTarget({
        targetObject: input.target,
        mapping: input.mapping,
      });

      try {
        return await runCodeEvalTest({
          prisma: ctx.prisma,
          orgId: ctx.session.orgId,
          projectId: input.projectId,
          evalTemplateId: input.evalTemplateId,
          target: input.target,
          mapping: input.mapping,
          scoreName: input.scoreName,
          observationId: input.observationId,
          traceId: input.traceId,
          startTime: input.startTime,
          shouldReadFromObservationsTable:
            input.shouldReadFromObservationsTable,
        });
      } catch (error) {
        if (error instanceof CodeEvalTestRunSetupError) {
          throw toCodeEvalTRPCError(error);
        }

        throw error;
      }
    }),
  createTemplate: protectedProjectProcedure
    .input(CreateEvalTemplateInputSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluator:CUD",
      });

      await validateEvalTemplateCreation(input);

      const definition =
        input.type === EvalTemplateType.CODE
          ? {
              type: EvalTemplateType.CODE,
              sourceCode: input.sourceCode,
              sourceCodeLanguage: input.sourceCodeLanguage,
            }
          : {
              type: EvalTemplateType.LLM_AS_JUDGE,
              promptMessages: reconcileEvaluatorPromptMessages({
                prompt: input.prompt,
              }),
              provider: input.provider ?? null,
              model: input.model ?? null,
              modelParams: input.modelParams ?? null,
              vars: input.vars,
              variableMapping: null,
              outputDefinition: input.outputDefinition,
            };
      const result = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).saveTemplate({
        projectId: input.projectId,
        name: input.name,
        definition,
        createdByUserId: ctx.session.user.id,
        intent:
          input.intent === "new-version"
            ? {
                type: "new-version",
                sourceTemplateId: input.sourceTemplateId,
              }
            : input.intent === "clone"
              ? { type: "clone", cloneSourceId: input.cloneSourceId }
              : { type: input.intent },
      });
      if (!result?.template) {
        throw new LangfuseNotFoundError("Evaluator not found");
      }
      await auditLog({
        session: ctx.session,
        resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: result.template.id,
        action: "create",
      });
      // A new version takes effect immediately for every rule using it
      if (result.updatedConfigCount > 0) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }
      return result;
    }),

  updateAllDatasetEvalJobStatusByTemplateId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evalTemplateId: z.string(),
        datasetId: z.string(),
        newStatus: z.enum(EvaluatorStatus),
      }),
    )
    .mutation(
      async ({
        ctx,
        input: { projectId, evalTemplateId, datasetId, newStatus },
      }) => {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: projectId,
          scope: "evaluationRule:CUD",
        });

        const compatibility = new LegacyEvalCompatibilityService(ctx.prisma);
        const { configs } = await compatibility.listConfigs({
          projectId,
          // The experiment selector creates EXPERIMENT-target configs; DATASET
          // is the legacy shape — the toggle must reach both.
          targetObjects: [
            EvalTargetObject.DATASET,
            EvalTargetObject.EXPERIMENT,
          ],
        });
        const evaluators = configs.filter(
          (config) => config.evalTemplateId === evalTemplateId,
        );

        const filteredEvaluators = selectDatasetEvaluatorsForStatusChange({
          evaluators,
          datasetId,
          newStatus,
        });

        if (
          newStatus === JobConfigState.ACTIVE &&
          filteredEvaluators.length > 0
        ) {
          const template = evaluators[0]?.evalTemplate;
          if (!template) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Evaluator template not found",
            });
          }
          await assertTemplateCanRunForActivation({ projectId, template });
        }

        await compatibility.setConfigStatuses({
          projectId,
          ruleIds: filteredEvaluators.map(({ id }) => id),
          status: newStatus,
        });

        if (
          newStatus === JobConfigState.ACTIVE &&
          filteredEvaluators.length > 0
        ) {
          await invalidateProjectEvalConfigCaches(projectId);
        }

        return {
          success: true,
          message: `Updated ${filteredEvaluators.length} evaluators to ${newStatus}`,
        };
      },
    ),

  updateEvalJob: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evalConfigId: z.string(),
        config: UpdateEvalJobSchema,
      }),
    )
    .mutation(async ({ ctx, input: { config, projectId, evalConfigId } }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evaluationRule:CUD",
      });

      const compatibility = new LegacyEvalCompatibilityService(ctx.prisma);
      const existingJob = await compatibility.getConfig(
        projectId,
        evalConfigId,
      );

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

      // Only enforce EXISTING-only deactivation rule for legacy targets (TRACE/DATASET)
      if (
        (existingJob.targetObject === EvalTargetObject.TRACE ||
          existingJob.targetObject === EvalTargetObject.DATASET) &&
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

      const validatedConfig = {
        ...config,
        ...(config.variableMapping !== undefined
          ? {
              variableMapping: validateVariableMappingForTarget({
                targetObject: existingJob.targetObject,
                mapping: config.variableMapping,
              }),
            }
          : {}),
      };
      const filterValidation = validateEvaluatorFiltersForTarget({
        targetObject: existingJob.targetObject as EvalTargetObject,
        filter: config.filter ?? existingJob.filter ?? [],
      });
      if (!filterValidation.isValid) {
        throw new InvalidRequestError(
          filterValidation.issues[0]?.message ??
            "Evaluator filters are invalid. Remove unsupported or incomplete filters and try again.",
        );
      }
      const validatedFilter = filterValidation.validatedFilters;

      if (existingJob.evalTemplate?.type === EvalTemplateType.CODE) {
        assertCodeEvalTemplateCanRun({
          sourceCodeLanguage: existingJob.evalTemplate.sourceCodeLanguage,
        });
        await assertCodeEvalJobConfigCanRunForTRPC({
          prisma: ctx.prisma,
          orgId: ctx.session.orgId,
          projectId,
          evalTemplateId: existingJob.evalTemplate.id,
          target: existingJob.targetObject as EvalTargetObject,
          mapping:
            validatedConfig.variableMapping ?? existingJob.variableMapping,
          scoreName: config.scoreName ?? existingJob.scoreName,
          filter: validatedFilter ?? [],
        });
      }

      if (
        shouldValidateBeforeActivation({
          currentStatus: existingJob.status,
          blockedAt: existingJob.blockedAt,
          nextStatus: config.status,
        })
      ) {
        if (!existingJob.evalTemplate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Evaluator template not found",
          });
        }
        await assertTemplateCanRunForActivation({
          projectId,
          template: existingJob.evalTemplate,
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evalConfigId,
        action: "update",
      });

      const updatedConfig = {
        ...validatedConfig,
        ...(config.filter !== undefined
          ? {
              filter: validatedFilter ?? [],
            }
          : {}),
      };

      const updatedJob = await compatibility.updateConfig({
        projectId,
        ruleId: evalConfigId,
        data: updatedConfig,
      });

      // Clear the "no job configs" caches if we're activating a job configuration
      if (config.status === "ACTIVE") {
        await invalidateProjectEvalConfigCaches(projectId);
      }

      // EVENT targets handle historical evaluation via the dedicated batch
      // "Run Evaluation" action (runEvaluationRouter), so we only schedule
      // historical backfills here for TRACE and DATASET targets.
      if (
        config.timeScope?.includes("EXISTING") &&
        (existingJob?.targetObject === EvalTargetObject.TRACE ||
          existingJob?.targetObject === EvalTargetObject.DATASET)
      ) {
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

  deleteEvalJob: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalConfigId: z.string() }))
    .mutation(async ({ ctx, input: { projectId, evalConfigId } }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evaluationRule:CUD",
      });

      const compatibility = new LegacyEvalCompatibilityService(ctx.prisma);
      const existingJob = await compatibility.getConfig(
        projectId,
        evalConfigId,
      );
      if (!existingJob) {
        logger.warn(
          `Job for deletion not found for project ${projectId} and id ${evalConfigId}`,
        );
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evalConfigId,
        action: "delete",
      });

      const deleted = await compatibility.deleteConfig(projectId, evalConfigId);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      // Clear the "no job configs" caches to ensure they are re-evaluated
      // This is conservative but ensures correctness after deletion
      await invalidateProjectEvalConfigCaches(projectId);
    }),

  evalTemplateUsage: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateId: z.string() }))
    .query(async ({ ctx, input: { projectId, evalTemplateId } }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evaluator:read",
      });

      return new LegacyEvalCompatibilityService(ctx.prisma).getTemplateUsage(
        projectId,
        evalTemplateId,
      );
    }),

  deleteEvalTemplate: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateId: z.string() }))
    .mutation(async ({ ctx, input: { projectId, evalTemplateId } }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evaluator:CUD",
      });

      const deletedVersions = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).deleteTemplate(projectId, evalTemplateId);

      await Promise.all(
        deletedVersions.map((version) =>
          auditLog({
            session: ctx.session,
            resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
            resourceId: version.id,
            action: "delete",
            before: version,
          }),
        ),
      );
    }),
  getLogs: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        filter: z.array(singleFilter),
        jobConfigurationId: z.string().optional(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJobExecution:read",
      });

      // Strip deprecated filters — these columns were removed from the UI
      // because they required traces/scores data that no longer lives in
      // Postgres, but bookmarked URLs may still include them.
      const filters = input.filter.filter(
        (f) => !DEPRECATED_FILTER_COLUMNS.has(f.column),
      );

      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        filters,
        evalExecutionsFilterCols,
        "job_executions",
      );
      const executionConfigIds = input.jobConfigurationId
        ? (
            await new LegacyEvalCompatibilityService(
              ctx.prisma,
            ).resolveExecutionConfigIds(input.projectId, [
              input.jobConfigurationId,
            ])
          )[input.jobConfigurationId]
        : undefined;

      const [jobExecutions, count] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<
            Pick<
              JobExecution,
              | "status"
              | "startTime"
              | "endTime"
              | "jobOutputScoreId"
              | "jobInputTraceId"
              | "jobTemplateId"
              | "jobConfigurationId"
              | "executionTraceId"
              | "error"
            >
          >
        >(
          generateExecutionsQuery(
            Prisma.sql`
            je.status,
            je.start_time as "startTime",
            je.end_time as "endTime",
            je.job_output_score_id as "jobOutputScoreId",
            je.job_input_trace_id as "jobInputTraceId",
            je.job_template_id as "jobTemplateId",
            je.job_configuration_id as "jobConfigurationId",
            je.execution_trace_id as "executionTraceId",
            je.error
            `,
            input.projectId,
            filterCondition,
            Prisma.sql`ORDER BY je.created_at DESC`,
            input.limit,
            input.page,
            executionConfigIds,
          ),
        ),
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generateExecutionsQuery(
            Prisma.sql`COUNT(*) AS "totalCount"`,
            input.projectId,
            filterCondition,
            Prisma.empty,
            1, // limit
            0, // page
            executionConfigIds,
          ),
        ),
      ]);

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
        totalCount: count.length > 0 ? Number(count[0]?.totalCount) : 0,
      };
    }),

  jobConfigsByDatasetId: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), datasetId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evaluationRule:read",
      });

      const { configs } = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).listConfigs({
        projectId: input.projectId,
        targetObjects: [EvalTargetObject.DATASET],
      });
      const selectedIds = new Set(
        selectDatasetEvaluatorsForStatusChange({
          evaluators: configs,
          datasetId: input.datasetId,
          newStatus: JobConfigState.INACTIVE,
        }).map(({ id }) => id),
      );
      return configs
        .filter(({ id }) => selectedIds.has(id))
        .map(({ id, scoreName }) => ({ id, scoreName }));
    }),

  jobExecutionCountsByEvaluatorIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJobExecution:read",
      });

      if (input.evaluatorIds.length === 0) {
        return {};
      }

      const executionIdsByRuleId = await new LegacyEvalCompatibilityService(
        ctx.prisma,
      ).resolveExecutionConfigIds(input.projectId, input.evaluatorIds);
      const executionCountsById =
        await getEvaluatorExecutionStatusCountsByEvaluatorId({
          prisma: ctx.prisma,
          projectId: input.projectId,
          evaluatorIds: [
            ...new Set(Object.values(executionIdsByRuleId).flat()),
          ],
        });

      // Fold the persisted rule- and evaluator-addressed rows back into the
      // legacy rule IDs requested by the table.
      return Object.fromEntries(
        input.evaluatorIds.map((ruleId) => {
          const countsByStatus = new Map<
            EvaluatorExecutionStatusCount["status"],
            number
          >();
          for (const executionId of executionIdsByRuleId[ruleId] ?? [ruleId]) {
            for (const { status, count } of executionCountsById[executionId] ??
              []) {
              countsByStatus.set(
                status,
                (countsByStatus.get(status) ?? 0) + count,
              );
            }
          }
          return [
            ruleId,
            [...countsByStatus].map(([status, count]) => ({ status, count })),
          ];
        }),
      );
    }),

  costByEvaluatorIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJobExecution:read",
      });

      const costs: Array<{ id: string; totalCost: number }> =
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
          ? (
              await getCostByEvaluatorIds(input.projectId, input.evaluatorIds)
            ).map(({ evaluatorId, totalCost }) => ({
              id: evaluatorId,
              totalCost,
            }))
          : (await getTotalCostByRule(input.projectId, input.evaluatorIds)).map(
              ({ ruleId, totalCost }) => ({ id: ruleId, totalCost }),
            );

      // Convert array to map for easier lookup
      return costs.reduce(
        (acc, { id, totalCost }) => {
          acc[id] = totalCost;
          return acc;
        },
        {} as Record<string, number>,
      );
    }),

  avgCostByEvaluatorIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJobExecution:read",
      });

      const costs =
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
          ? await getAvgCostByEvaluatorIdsFromObservations(
              input.projectId,
              input.evaluatorIds,
            )
          : await getAvgCostByEvaluatorIds(input.projectId, input.evaluatorIds);

      return costs.reduce(
        (acc, { evaluatorId, avgCost, executionCount }) => {
          acc[evaluatorId] = { avgCost, executionCount };
          return acc;
        },
        {} as Record<string, { avgCost: number; executionCount: number }>,
      );
    }),
});

const generateExecutionsQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
  jobConfigurationIds?: string[],
) => {
  const configCondition = jobConfigurationIds?.length
    ? Prisma.sql`AND je.job_configuration_id IN (${Prisma.join(jobConfigurationIds)})`
    : Prisma.empty;

  return Prisma.sql`
  SELECT
   ${select}
   FROM job_executions je
   WHERE je.project_id = ${projectId}
   ${filterCondition}
   AND je.status != 'CANCELLED'
   ${configCondition}
   ${orderCondition}
   LIMIT ${limit} OFFSET ${page * limit};
  `;
};
