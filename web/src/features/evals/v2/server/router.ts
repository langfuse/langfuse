import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  ActionId,
  BatchActionStatus,
  BatchTableNames,
  InvalidRequestError,
  JobConfigState,
  LangfuseConflictError,
  LangfuseNotFoundError,
  observationVariableMapping,
  PersistedEvalOutputDefinitionSchema,
  Prisma,
  singleFilter,
  validateEvaluatorFiltersForTarget,
  variableMapping,
} from "@langfuse/shared";
import {
  BatchActionQueue,
  getCostByRunScopeIds,
  getObservationsCountFromEventsTable,
  getObservationByIdFromEventsTable,
  invalidateProjectEvalConfigCaches,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
  JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
} from "@/src/features/evals/server/audit-log-resource-types";
import {
  DEFAULT_OUTPUT_DEFINITION,
  runLlmJudgeTest,
} from "@/src/features/evals/v2/server/testRunLlmJudge";
import {
  CodeEvalTestRunSetupError,
  runDraftCodeEvalTest,
} from "@/src/features/evals/server/codeEvalTestRun";
import { isCodeEvalEnabled } from "@/src/features/evals/server/isCodeEvalEnabled";
import {
  activateEvaluator,
  EvaluatorActivationScopeSchema,
} from "@/src/features/evals/v2/server/evaluatorActivationService";
import {
  attachEvaluatorToRunScope,
  createRunScope,
  deleteRunScope,
  deleteRunScopes as deleteRunScopesService,
  detachEvaluatorFromRunScope,
  setRunScopesEnabled,
} from "@/src/features/evals/v2/server/runScopeService";
import { deleteEvaluators } from "@/src/features/evals/v2/server/evaluatorOverviewService";

// "trace" remains readable for scopes saved by the earlier prototype; new
// scopes are observation ("event") or experiment based.
const ScopeTargetObjectSchema = z
  .enum(["trace", "event", "experiment"])
  .default("event");

const RunScopeInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    runScopeId: z.string(),
  }),
  z.object({
    mode: z.literal("new"),
    name: z.string().min(1),
    targetObject: ScopeTargetObjectSchema,
    filter: z.array(singleFilter).nullable(),
    sampling: z.number().gt(0).lte(1),
    delay: z.number().gte(0).default(30_000),
  }),
  // Draft save: the evaluator keeps its scope config on the job row but no
  // shared scope is created and nothing runs (status is forced INACTIVE).
  z.object({
    mode: z.literal("none"),
    targetObject: ScopeTargetObjectSchema,
    filter: z.array(singleFilter).nullable(),
    sampling: z.number().gt(0).lte(1),
  }),
]);

const CreateRuleSchema = z.object({
  projectId: z.string(),
  scoreName: z.string().min(1),
  description: z.string().nullish(),
  evaluatorType: z.enum(["LLM_AS_JUDGE", "CODE"]).default("LLM_AS_JUDGE"),
  // Managed (Langfuse/partner) template this evaluator started from. Absent
  // for create-from-scratch.
  sourceTemplateId: z.string().nullish(),
  prompt: z.string().nullish(),
  sourceCode: z.string().nullish(),
  sourceCodeLanguage: z.enum(["PYTHON", "TYPESCRIPT"]).nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  modelParams: z.record(z.string(), z.unknown()).nullish(),
  outputDefinition: PersistedEvalOutputDefinitionSchema.nullish(),
  mapping: z.union([
    z.array(variableMapping),
    z.array(observationVariableMapping),
  ]),
  scope: RunScopeInputSchema,
  // Keep evaluating new data as it arrives (timeScope NEW).
  runContinuously: z.boolean().default(true),
  // One-time backfill (timeScope EXISTING) over the scope's existing matches
  // within [from, to], via an observation batch-evaluation action. maxCount
  // caps how many observations the pass evaluates.
  backfill: z
    .object({
      from: z.coerce.date(),
      to: z.coerce.date(),
      maxCount: z.number().int().positive().nullish(),
    })
    .nullish(),
  status: z
    .enum([JobConfigState.ACTIVE, JobConfigState.INACTIVE])
    .default(JobConfigState.ACTIVE),
});

const TestRunSchema = z.object({
  projectId: z.string(),
  prompt: z.string().min(1),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  modelParams: z.record(z.string(), z.unknown()).nullish(),
  outputDefinition: PersistedEvalOutputDefinitionSchema.nullish(),
  sourceTemplateId: z.string().nullish(),
  mapping: z.array(observationVariableMapping),
  observationId: z.string(),
  traceId: z.string(),
  observationStartTime: z.coerce.date().optional(),
});

const CodeTestRunSchema = z.object({
  projectId: z.string(),
  sourceCode: z.string().min(1),
  sourceCodeLanguage: z.enum(["PYTHON", "TYPESCRIPT"]),
  scoreName: z.string().min(1),
  mapping: z.array(observationVariableMapping),
  observationId: z.string(),
  traceId: z.string(),
  observationStartTime: z.coerce.date(),
});

export const evalsV2Router = createTRPCRouter({
  // Langfuse-owned and partner-maintained evaluators only — user templates are
  // deliberately not part of the v2 catalog.
  catalog: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      return ctx.prisma.evalTemplate.findMany({
        where: { projectId: null },
        orderBy: [{ name: "asc" }, { version: "desc" }],
        distinct: ["name"],
      });
    }),

  // Latest version of each template the project created itself — powers the
  // gallery's "Clone from existing" section, mirroring the catalog shape.
  projectTemplates: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      return ctx.prisma.evalTemplate.findMany({
        where: { projectId: input.projectId },
        orderBy: [{ name: "asc" }, { version: "desc" }],
        distinct: ["name"],
        include: {
          createdByUser: { select: { name: true, email: true } },
        },
      });
    }),

  evaluators: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const evaluators = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
          evalTemplateId: { not: null },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          scoreName: true,
          createdAt: true,
          updatedAt: true,
          createdByUser: { select: { name: true, email: true } },
          evalTemplate: { select: { type: true } },
          _count: { select: { runScopeAssignments: true } },
        },
      });

      return evaluators.map(({ _count, ...evaluator }) => ({
        ...evaluator,
        usedByCount: _count.runScopeAssignments,
      }));
    }),

  runScopes: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const scopes = await ctx.prisma.evalRunScope.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { evaluatorAssignments: true } },
          evaluatorAssignments: {
            select: {
              jobConfiguration: {
                select: { id: true, scoreName: true },
              },
            },
            take: 5,
          },
          jobExecutions: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              executionTraceId: true,
              jobConfiguration: {
                select: { id: true, scoreName: true },
              },
            },
          },
        },
      });

      return scopes.map((scope) => ({
        ...scope,
        sampling: scope.sampling.toNumber(),
        filter: z.array(singleFilter).catch([]).parse(scope.filter),
        evaluators: scope.evaluatorAssignments.map(
          (assignment) => assignment.jobConfiguration,
        ),
        evaluatorCount: scope._count.evaluatorAssignments,
      }));
    }),

  runScopeCosts: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeIds: z.array(z.string()).max(1_000),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const costs = await getCostByRunScopeIds(
        input.projectId,
        input.runScopeIds,
      );

      return Object.fromEntries(
        costs.map(({ runScopeId, totalCost }) => [runScopeId, totalCost]),
      );
    }),

  runScopeById: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), runScopeId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const runScope = await ctx.prisma.evalRunScope.findFirst({
        where: { id: input.runScopeId, projectId: input.projectId },
        include: {
          evaluatorAssignments: {
            orderBy: { createdAt: "asc" },
            select: {
              jobConfiguration: {
                select: { id: true, scoreName: true },
              },
            },
          },
        },
      });
      if (!runScope) {
        throw new LangfuseNotFoundError("Run scope not found");
      }

      return {
        ...runScope,
        sampling: runScope.sampling.toNumber(),
        filter: z.array(singleFilter).catch([]).parse(runScope.filter),
        evaluators: runScope.evaluatorAssignments.map(
          (assignment) => assignment.jobConfiguration,
        ),
      };
    }),

  evaluatorOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      return ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
          evalTemplateId: { not: null },
        },
        select: {
          id: true,
          scoreName: true,
          targetObject: true,
          status: true,
          evalTemplate: { select: { type: true } },
        },
        orderBy: { scoreName: "asc" },
      });
    }),

  updateEvaluatorDefinition: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        scoreName: z.string().trim().min(1),
        description: z.string().trim().nullable(),
        prompt: z.string().nullable(),
        sourceCode: z.string().nullable(),
        sourceCodeLanguage: z.enum(["PYTHON", "TYPESCRIPT"]).nullable(),
        provider: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        modelParams: z.record(z.string(), z.unknown()).nullable().optional(),
        outputDefinition:
          PersistedEvalOutputDefinitionSchema.nullable().optional(),
        mapping: z.union([
          z.array(variableMapping),
          z.array(observationVariableMapping),
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const evaluator = await ctx.prisma.jobConfiguration.findFirst({
        where: { id: input.evaluatorId, projectId: input.projectId },
        include: { evalTemplate: true },
      });
      if (!evaluator?.evalTemplate) {
        throw new LangfuseNotFoundError("Evaluator not found");
      }

      const template = evaluator.evalTemplate;
      const prompt =
        template.type === "LLM_AS_JUDGE" ? input.prompt : template.prompt;
      const sourceCode =
        template.type === "CODE" ? input.sourceCode : template.sourceCode;
      const sourceCodeLanguage =
        template.type === "CODE"
          ? (input.sourceCodeLanguage ?? template.sourceCodeLanguage)
          : template.sourceCodeLanguage;
      const provider =
        template.type === "LLM_AS_JUDGE" && input.provider !== undefined
          ? input.provider
          : template.provider;
      const model =
        template.type === "LLM_AS_JUDGE" && input.model !== undefined
          ? input.model
          : template.model;
      const modelParams =
        template.type === "LLM_AS_JUDGE" && input.modelParams !== undefined
          ? input.modelParams
          : template.modelParams;
      const outputDefinition =
        template.type === "LLM_AS_JUDGE" && input.outputDefinition !== undefined
          ? input.outputDefinition
          : template.outputDefinition;
      if (template.type === "LLM_AS_JUDGE" && !prompt?.trim()) {
        throw new InvalidRequestError("The evaluator prompt cannot be empty");
      }
      if (template.type === "CODE" && !sourceCode?.trim()) {
        throw new InvalidRequestError(
          "The evaluator source code cannot be empty",
        );
      }

      const vars =
        template.type === "LLM_AS_JUDGE" && prompt
          ? Array.from(
              new Set(
                [...prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(
                  (match) => match[1],
                ),
              ),
            )
          : template.vars;
      const definitionChanged =
        prompt !== template.prompt ||
        sourceCode !== template.sourceCode ||
        sourceCodeLanguage !== template.sourceCodeLanguage ||
        provider !== template.provider ||
        model !== template.model ||
        JSON.stringify(modelParams) !== JSON.stringify(template.modelParams) ||
        JSON.stringify(outputDefinition) !==
          JSON.stringify(template.outputDefinition);

      await ctx.prisma.$transaction(async (tx) => {
        let evalTemplateId = template.id;
        if (definitionChanged) {
          const latestVersion = await tx.evalTemplate.aggregate({
            where: { projectId: input.projectId, name: template.name },
            _max: { version: true },
          });
          const projectTemplate = await tx.evalTemplate.create({
            data: {
              projectId: input.projectId,
              createdByUserId: ctx.session.user.id,
              name: template.name,
              version: (latestVersion._max.version ?? 0) + 1,
              type: template.type,
              partner: template.partner,
              prompt,
              model,
              provider,
              modelParams:
                (modelParams as Prisma.InputJsonValue | null) ?? undefined,
              vars,
              outputDefinition:
                (outputDefinition as Prisma.InputJsonValue | null) ?? undefined,
              sourceCode,
              sourceCodeLanguage,
            },
          });
          evalTemplateId = projectTemplate.id;
        }

        await tx.jobConfiguration.update({
          where: { id: evaluator.id, projectId: input.projectId },
          data: {
            evalTemplateId,
            scoreName: input.scoreName,
            description: input.description,
            variableMapping: input.mapping,
          },
        });
      });

      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evaluator.id,
        action: "update",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);
      return { id: evaluator.id };
    }),

  // Assignments read targeting from the scope, so one update applies to every
  // attached evaluator without duplicating the filter onto every job row.
  updateRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeId: z.string(),
        name: z.string().trim().min(1),
        filter: z.array(singleFilter).nullable(),
        sampling: z.number().gt(0).lte(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const scope = await ctx.prisma.evalRunScope.findFirst({
        where: { id: input.runScopeId, projectId: input.projectId },
      });
      if (!scope) {
        throw new LangfuseNotFoundError("Run scope not found");
      }

      try {
        await ctx.prisma.evalRunScope.update({
          where: { id: scope.id, projectId: input.projectId },
          data: {
            name: input.name,
            filter: input.filter ?? [],
            sampling: input.sampling,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new LangfuseConflictError(
            `A run scope named "${input.name}" already exists.`,
          );
        }
        throw error;
      }
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: scope.id,
        action: "update",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { id: scope.id };
    }),

  deleteRunScope: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), runScopeId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await deleteRunScope({
        prisma: ctx.prisma,
        ...input,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: result.id,
        action: "delete",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return result;
    }),

  setRunScopesEnabled: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeIds: z.array(z.string()).min(1),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const ids = await setRunScopesEnabled({
        prisma: ctx.prisma,
        ...input,
      });
      await Promise.all(
        ids.map((resourceId) =>
          auditLog({
            session: ctx.session,
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId,
            action: "update",
          }),
        ),
      );
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { ids };
    }),

  deleteRunScopes: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const ids = await deleteRunScopesService({
        prisma: ctx.prisma,
        ...input,
      });
      await Promise.all(
        ids.map((resourceId) =>
          auditLog({
            session: ctx.session,
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId,
            action: "delete",
          }),
        ),
      );
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { ids };
    }),

  deleteEvaluators: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const ids = await deleteEvaluators({
        prisma: ctx.prisma,
        ...input,
      });
      await Promise.all(
        ids.map((resourceId) =>
          auditLog({
            session: ctx.session,
            resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
            resourceId,
            action: "delete",
          }),
        ),
      );
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { ids };
    }),

  createRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().trim().min(1),
        targetObject: ScopeTargetObjectSchema,
        filter: z.array(singleFilter).nullable(),
        sampling: z.number().gt(0).lte(1),
        evaluatorId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const runScope = await createRunScope({
        prisma: ctx.prisma,
        projectId: input.projectId,
        name: input.name,
        targetObject: input.targetObject,
        filter: input.filter ?? [],
        sampling: input.sampling,
        evaluatorId: input.evaluatorId,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: input.evaluatorId ?? runScope.id,
        action: "create",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { id: runScope.id };
    }),

  attachEvaluatorToRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        runScopeId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await attachEvaluatorToRunScope({
        prisma: ctx.prisma,
        ...input,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: input.evaluatorId,
        action: "update",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);
      return result;
    }),

  detachEvaluatorFromRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        runScopeId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await detachEvaluatorFromRunScope({
        prisma: ctx.prisma,
        ...input,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: input.evaluatorId,
        action: "update",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);
      return result;
    }),

  renameRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeId: z.string(),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      try {
        await ctx.prisma.evalRunScope.update({
          where: { id: input.runScopeId, projectId: input.projectId },
          data: { name: input.name.trim() },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new LangfuseConflictError(
            `A run scope named "${input.name.trim()}" already exists.`,
          );
        }
        throw error;
      }

      return { id: input.runScopeId };
    }),

  activateRule: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        scope: EvaluatorActivationScopeSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: input.evaluatorId,
        action: "update",
      });

      const result = await activateEvaluator({
        prisma: ctx.prisma,
        projectId: input.projectId,
        evaluatorId: input.evaluatorId,
        scope: input.scope,
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return result;
    }),

  createRule: protectedProjectProcedure
    .input(CreateRuleSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      // 1. Resolve the run scope (reused or newly saved)
      let runScopeId: string | null = null;
      let scopeValues: {
        targetObject: string;
        filter: z.infer<typeof singleFilter>[];
        sampling: number;
        delay: number;
      };

      if (input.scope.mode === "existing") {
        const existingScope = await ctx.prisma.evalRunScope.findFirst({
          where: { id: input.scope.runScopeId, projectId: input.projectId },
        });
        if (!existingScope) {
          throw new LangfuseNotFoundError("Run scope not found");
        }
        runScopeId = existingScope.id;
        scopeValues = {
          targetObject: existingScope.targetObject,
          filter: z.array(singleFilter).parse(existingScope.filter),
          sampling: existingScope.sampling.toNumber(),
          delay: existingScope.delay,
        };
      } else if (input.scope.mode === "none") {
        // Draft: keep the config on the job so it isn't lost, create no scope.
        scopeValues = {
          targetObject: input.scope.targetObject,
          filter: input.scope.filter ?? [],
          sampling: input.scope.sampling,
          delay: 30_000,
        };
      } else {
        // Prototype: keep search-bar-produced filters as-is when they don't
        // pass strict trace-column validation.
        const filterValidation = validateEvaluatorFiltersForTarget({
          targetObject: input.scope.targetObject,
          filter: input.scope.filter ?? [],
        });
        const filter = filterValidation.isValid
          ? (filterValidation.validatedFilters ?? [])
          : (input.scope.filter ?? []);
        if (!filterValidation.isValid) {
          logger.info(
            "evalsV2.createRule: storing filter without strict validation",
            { issues: filterValidation.issues },
          );
        }

        scopeValues = {
          targetObject: input.scope.targetObject,
          filter,
          sampling: input.scope.sampling,
          delay: input.scope.delay,
        };

        try {
          const scope = await ctx.prisma.evalRunScope.create({
            data: {
              projectId: input.projectId,
              name: input.scope.name,
              targetObject: input.scope.targetObject,
              filter: filter,
              sampling: input.scope.sampling,
              delay: input.scope.delay,
            },
          });
          runScopeId = scope.id;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new LangfuseConflictError(
              `A run scope named "${input.scope.name}" already exists — reuse it instead.`,
            );
          }
          throw error;
        }
      }

      // A scope-less draft can never run — force it inactive.
      const status =
        input.scope.mode === "none" ? JobConfigState.INACTIVE : input.status;

      // Backfill only applies to live observation-target rules. Count the
      // matches first so an over-limit request fails before anything exists.
      const backfill =
        input.backfill &&
        status === JobConfigState.ACTIVE &&
        scopeValues.targetObject === "event"
          ? input.backfill
          : null;
      if (
        status === JobConfigState.ACTIVE &&
        !input.runContinuously &&
        !backfill
      ) {
        throw new InvalidRequestError(
          "Nothing to run: enable continuous evaluation or a one-time backfill.",
        );
      }
      const backfillFilter: z.infer<typeof singleFilter>[] = backfill
        ? [
            ...scopeValues.filter,
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: backfill.from,
            },
            {
              column: "startTime",
              type: "datetime",
              operator: "<=",
              value: backfill.to,
            },
          ]
        : scopeValues.filter;
      if (backfill) {
        const matchCount = await getObservationsCountFromEventsTable({
          projectId: input.projectId,
          filter: backfillFilter,
        });
        const effectiveCount = backfill.maxCount
          ? Math.min(matchCount, backfill.maxCount)
          : matchCount;
        if (effectiveCount > env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT) {
          throw new InvalidRequestError(
            `The backfill matches ${matchCount} observations — the maximum is ${env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT}. Narrow the window, set a max limit, or disable the backfill.`,
          );
        }
      }

      // 2. Resolve the evaluator definition: reference the managed template
      // when fully unchanged, otherwise store a project-owned copy.
      let evalTemplateId: string;

      const sourceTemplate = input.sourceTemplateId
        ? await ctx.prisma.evalTemplate.findFirst({
            where: { id: input.sourceTemplateId, projectId: null },
          })
        : null;

      if (input.evaluatorType === "CODE") {
        if (!input.sourceCode || !input.sourceCodeLanguage) {
          throw new InvalidRequestError(
            "Code evaluators need source code and a language.",
          );
        }
        evalTemplateId = await createProjectTemplate(ctx.prisma, {
          projectId: input.projectId,
          createdByUserId: ctx.session.user.id,
          name: input.scoreName,
          type: "CODE",
          prompt: null,
          sourceCode: input.sourceCode,
          sourceCodeLanguage: input.sourceCodeLanguage,
          vars: [],
          outputDefinition: input.outputDefinition ?? DEFAULT_OUTPUT_DEFINITION,
        });
        await auditLog({
          session: ctx.session,
          resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: evalTemplateId,
          action: "create",
        });
      } else {
        if (!input.prompt) {
          throw new InvalidRequestError(
            "LLM-as-a-judge evaluators need a prompt.",
          );
        }

        const outputDefinitionUnchanged =
          input.outputDefinition == null ||
          (sourceTemplate !== null &&
            JSON.stringify(input.outputDefinition) ===
              JSON.stringify(sourceTemplate.outputDefinition));

        const templateUnchanged =
          sourceTemplate !== null &&
          sourceTemplate.prompt === input.prompt &&
          !input.model &&
          !input.provider &&
          !input.modelParams &&
          outputDefinitionUnchanged;

        if (sourceTemplate && templateUnchanged) {
          evalTemplateId = sourceTemplate.id;
        } else {
          const vars = Array.from(
            new Set(
              [...input.prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(
                (m) => m[1],
              ),
            ),
          );
          evalTemplateId = await createProjectTemplate(ctx.prisma, {
            projectId: input.projectId,
            createdByUserId: ctx.session.user.id,
            name: sourceTemplate
              ? `${sourceTemplate.name} (${input.scoreName})`
              : input.scoreName,
            type: "LLM_AS_JUDGE",
            prompt: input.prompt,
            model: input.model ?? sourceTemplate?.model,
            provider: input.provider ?? sourceTemplate?.provider,
            modelParams:
              (input.modelParams as Prisma.InputJsonValue | undefined) ??
              sourceTemplate?.modelParams ??
              undefined,
            vars,
            outputDefinition:
              input.outputDefinition ??
              sourceTemplate?.outputDefinition ??
              DEFAULT_OUTPUT_DEFINITION,
          });
          await auditLog({
            session: ctx.session,
            resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
            resourceId: evalTemplateId,
            action: "create",
          });
        }
      }

      // 3. Create the evaluator (job configuration)
      const jobId = uuidv4();
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: jobId,
        action: "create",
      });

      const job = await ctx.prisma.$transaction(async (tx) => {
        const createdJob = await tx.jobConfiguration.create({
          data: {
            id: jobId,
            projectId: input.projectId,
            createdByUserId: ctx.session.user.id,
            jobType: "EVAL",
            evalTemplateId,
            scoreName: input.scoreName,
            description: input.description ?? null,
            targetObject: scopeValues.targetObject,
            filter: scopeValues.filter,
            variableMapping: input.mapping,
            sampling: scopeValues.sampling,
            delay: scopeValues.delay,
            status,
            timeScope: [
              // Drafts keep NEW so activating them later behaves normally.
              ...(input.runContinuously || status === JobConfigState.INACTIVE
                ? ["NEW" as const]
                : []),
              ...(backfill ? ["EXISTING" as const] : []),
            ],
          },
        });

        if (runScopeId) {
          await tx.evalRunScopeAssignment.create({
            data: {
              jobConfigurationId: createdJob.id,
              runScopeId,
            },
          });
        }
        return createdJob;
      });

      if (status === JobConfigState.ACTIVE) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }

      // 4. Backfill: evaluate the scope's existing matches in [from, to] once,
      // via the same batch action the events table's "Run Evaluation" uses.
      if (backfill) {
        const backfillQuery = {
          filter: backfillFilter,
          orderBy: { column: "startTime", order: "DESC" as const },
        };
        const batchAction = await ctx.prisma.batchAction.create({
          data: {
            projectId: input.projectId,
            userId: ctx.session.user.id,
            actionType: ActionId.ObservationBatchEvaluation,
            tableName: BatchTableNames.Events,
            status: BatchActionStatus.Queued,
            query: backfillQuery,
            config: { evaluatorIds: [job.id] },
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "batchAction",
          resourceId: batchAction.id,
          projectId: input.projectId,
          action: ActionId.ObservationBatchEvaluation,
          after: batchAction,
        });
        await BatchActionQueue.getInstance()?.add(
          QueueJobs.BatchActionProcessingJob,
          {
            id: batchAction.id,
            name: QueueJobs.BatchActionProcessingJob,
            timestamp: new Date(),
            payload: {
              actionId: ActionId.ObservationBatchEvaluation,
              batchActionId: batchAction.id,
              projectId: input.projectId,
              cutoffCreatedAt: new Date(),
              query: backfillQuery,
              evaluatorIds: [job.id],
              maxCount: backfill.maxCount ?? null,
            },
          },
          { jobId: batchAction.id },
        );
      }

      return { id: job.id, runScopeId };
    }),

  // Sample observation for the setup form, read from the events table — the
  // same store the scope preview lists, so every previewed row resolves.
  sampleObservation: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        observationId: z.string(),
        traceId: z.string(),
        startTime: z.coerce.date().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const observation = await getObservationByIdFromEventsTable({
        id: input.observationId,
        projectId: input.projectId,
        traceId: input.traceId,
        startTime: input.startTime ?? undefined,
        fetchWithInputOutput: true,
      });
      if (!observation) {
        throw new LangfuseNotFoundError("Observation not found");
      }
      return observation;
    }),

  testRunLlmJudge: protectedProjectProcedure
    .input(TestRunSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const sourceTemplate = input.sourceTemplateId
        ? await ctx.prisma.evalTemplate.findFirst({
            where: {
              id: input.sourceTemplateId,
              OR: [{ projectId: input.projectId }, { projectId: null }],
            },
          })
        : null;

      const startedAt = Date.now();
      const result = await runLlmJudgeTest({
        projectId: input.projectId,
        prompt: input.prompt,
        provider: input.provider ?? sourceTemplate?.provider,
        model: input.model ?? sourceTemplate?.model,
        modelParams:
          input.modelParams ?? sourceTemplate?.modelParams ?? undefined,
        outputDefinition:
          input.outputDefinition ??
          sourceTemplate?.outputDefinition ??
          undefined,
        mapping: input.mapping,
        observationId: input.observationId,
        traceId: input.traceId,
        observationStartTime: input.observationStartTime,
      });
      return { ...result, durationMs: Date.now() - startedAt };
    }),

  // Test-runs the draft (unsaved) code of a code evaluator on the sample
  // observation — same dispatch path as saved templates, nothing persisted.
  testRunCodeEval: protectedProjectProcedure
    .input(CodeTestRunSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      if (!isCodeEvalEnabled()) {
        throw new InvalidRequestError(
          "Code evals are not enabled on this deployment.",
        );
      }

      try {
        const startedAt = Date.now();
        const outcome = await runDraftCodeEvalTest({
          orgId: ctx.session.orgId,
          projectId: input.projectId,
          sourceCode: input.sourceCode,
          sourceCodeLanguage: input.sourceCodeLanguage,
          target: "event",
          mapping: input.mapping,
          scoreName: input.scoreName,
          observationId: input.observationId,
          traceId: input.traceId,
          startTime: input.observationStartTime,
        });
        const durationMs = Date.now() - startedAt;

        // Flatten to the UI contract (mirrors the LLM test-run shape). `raw`
        // carries the untouched evaluation output for the raw-output toggle —
        // on failures, whatever the user's code returned (when available).
        return outcome.success
          ? {
              success: true as const,
              scores: outcome.result.scores,
              raw: outcome.result as unknown,
              executionTraceId: outcome.executionTraceId,
              durationMs,
            }
          : {
              success: false as const,
              error: `${outcome.error.code}: ${outcome.error.message}`,
              raw: outcome.error.returnedResult ?? null,
              executionTraceId: outcome.executionTraceId,
              durationMs,
            };
      } catch (error) {
        if (error instanceof CodeEvalTestRunSetupError) {
          throw new InvalidRequestError(error.message);
        }
        throw error;
      }
    }),
});

async function createProjectTemplate(
  prisma: PrismaClient,
  data: {
    projectId: string;
    createdByUserId: string;
    name: string;
    type: "LLM_AS_JUDGE" | "CODE";
    prompt: string | null;
    model?: string | null;
    provider?: string | null;
    modelParams?: Prisma.InputJsonValue;
    sourceCode?: string;
    sourceCodeLanguage?: "PYTHON" | "TYPESCRIPT";
    vars: string[];
    outputDefinition: unknown;
  },
): Promise<string> {
  const latestVersion = await prisma.evalTemplate.findFirst({
    where: { projectId: data.projectId, name: data.name },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const template = await prisma.evalTemplate.create({
    data: {
      projectId: data.projectId,
      createdByUserId: data.createdByUserId,
      name: data.name,
      version: (latestVersion?.version ?? 0) + 1,
      type: data.type,
      prompt: data.prompt,
      model: data.model,
      provider: data.provider,
      modelParams: data.modelParams,
      sourceCode: data.sourceCode,
      sourceCodeLanguage: data.sourceCodeLanguage,
      vars: data.vars,
      outputDefinition: data.outputDefinition as Prisma.InputJsonValue,
    },
  });

  return template.id;
}
