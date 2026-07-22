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
  getCostByEvaluationRuleIds,
  getExecutionTraceHistoryByEvaluationRuleId,
  getRecentExecutionTracesByEvaluationRuleIds,
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
  EvaluatorActivationRuleSchema,
} from "@/src/features/evals/v2/server/evaluatorActivationService";
import {
  attachEvaluatorToRule,
  createRule,
  deleteRule,
  deleteRules as deleteRulesService,
  detachEvaluatorFromRule,
  setRulesEnabled,
} from "@/src/features/evals/v2/server/evaluationRuleService";
import { deleteEvaluators } from "@/src/features/evals/v2/server/evaluatorOverviewService";

// "trace" remains readable for rules saved by the earlier prototype; new
// rules are observation ("event") or experiment based.
const EvaluationRuleObjectSchema = z
  .enum(["trace", "event", "experiment"])
  .default("event");

const EvaluationRuleInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    ruleId: z.string(),
  }),
  z.object({
    mode: z.literal("new"),
    name: z.string().min(1),
    targetObject: EvaluationRuleObjectSchema,
    filter: z.array(singleFilter).nullable(),
    sampling: z.number().gt(0).lte(1),
    delay: z.number().gte(0).default(30_000),
  }),
  // Draft save: the evaluator keeps its rule config on the job row but no
  // shared rule is created and nothing runs (status is forced INACTIVE).
  z.object({
    mode: z.literal("none"),
    targetObject: EvaluationRuleObjectSchema,
    filter: z.array(singleFilter).nullable(),
    sampling: z.number().gt(0).lte(1),
  }),
]);

const CreateEvaluatorSchema = z.object({
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
  rule: EvaluationRuleInputSchema,
  // Keep evaluating new data as it arrives (timeScope NEW).
  runContinuously: z.boolean().default(true),
  // One-time backfill (timeScope EXISTING) over the rule's existing matches
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
          runScopeAssignments: {
            orderBy: { createdAt: "asc" },
            take: 5,
            select: {
              runScope: { select: { id: true, name: true } },
            },
          },
          _count: { select: { runScopeAssignments: true } },
        },
      });

      return evaluators.map(
        ({ _count, evalTemplate, runScopeAssignments, ...evaluator }) => {
          return {
            ...evaluator,
            evalTemplate: evalTemplate ? { type: evalTemplate.type } : null,
            rules: runScopeAssignments.map((assignment) => assignment.runScope),
            ruleCount: _count.runScopeAssignments,
          };
        },
      );
    }),

  rules: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const rules = await ctx.prisma.evalRunScope.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: {
          createdByUser: { select: { name: true, email: true } },
          _count: { select: { evaluatorAssignments: true } },
          evaluatorAssignments: {
            orderBy: { createdAt: "asc" },
            select: {
              jobConfiguration: {
                select: { id: true, scoreName: true },
              },
            },
            take: 5,
          },
        },
      });

      const executionTraces = await getRecentExecutionTracesByEvaluationRuleIds(
        input.projectId,
        rules.map((rule) => rule.id),
      ).catch((error) => {
        logger.warn(
          "Could not load evaluation-rule execution traces for overview",
          { projectId: input.projectId, error },
        );
        return [];
      });
      const executionTracesByRule = executionTraces.reduce((byRule, trace) => {
        const traces = byRule.get(trace.ruleId) ?? [];
        traces.push(trace);
        byRule.set(trace.ruleId, traces);
        return byRule;
      }, new Map<string, typeof executionTraces>());

      return rules.map((rule) => ({
        ...rule,
        sampling: rule.sampling.toNumber(),
        filter: z.array(singleFilter).catch([]).parse(rule.filter),
        evaluators: rule.evaluatorAssignments.map(
          (assignment) => assignment.jobConfiguration,
        ),
        executionTraces: executionTracesByRule.get(rule.id) ?? [],
        evaluatorCount: rule._count.evaluatorAssignments,
      }));
    }),

  ruleCosts: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ruleIds: z.array(z.string()).max(1_000),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const costs = await getCostByEvaluationRuleIds(
        input.projectId,
        input.ruleIds,
      );

      return Object.fromEntries(
        costs.map(({ ruleId, totalCost }) => [ruleId, totalCost]),
      );
    }),

  ruleById: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), ruleId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const evaluationRule = await ctx.prisma.evalRunScope.findFirst({
        where: { id: input.ruleId, projectId: input.projectId },
        include: {
          createdByUser: { select: { name: true, email: true } },
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
      if (!evaluationRule) {
        throw new LangfuseNotFoundError("Evaluation rule not found");
      }

      const now = new Date();
      const historyStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
      );
      const executionHistoryRows =
        await getExecutionTraceHistoryByEvaluationRuleId(
          input.projectId,
          input.ruleId,
        ).catch((error) => {
          logger.warn(
            "Could not load evaluation-rule execution trace history",
            {
              projectId: input.projectId,
              ruleId: input.ruleId,
              error,
            },
          );
          return [];
        });
      const executionHistory = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(historyStart);
        day.setUTCDate(historyStart.getUTCDate() + index);
        const dayKey = day.toISOString().slice(0, 10);
        const counts = Object.fromEntries(
          executionHistoryRows
            .filter((row) => row.day.toISOString().slice(0, 10) === dayKey)
            .map((row) => [row.level, row.executionCount]),
        );

        return { day, counts };
      });

      return {
        ...evaluationRule,
        sampling: evaluationRule.sampling.toNumber(),
        filter: z.array(singleFilter).catch([]).parse(evaluationRule.filter),
        executionHistory,
        evaluators: evaluationRule.evaluatorAssignments.map(
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

  // Assignments read targeting from the rule, so one update applies to every
  // attached evaluator without duplicating the filter onto every job row.
  updateRule: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ruleId: z.string(),
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

      const rule = await ctx.prisma.evalRunScope.findFirst({
        where: { id: input.ruleId, projectId: input.projectId },
      });
      if (!rule) {
        throw new LangfuseNotFoundError("Evaluation rule not found");
      }

      try {
        await ctx.prisma.evalRunScope.update({
          where: { id: rule.id, projectId: input.projectId },
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
            `An evaluation rule named "${input.name}" already exists.`,
          );
        }
        throw error;
      }
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: rule.id,
        action: "update",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { id: rule.id };
    }),

  deleteRule: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), ruleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await deleteRule({
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

  setRulesEnabled: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ruleIds: z.array(z.string()).min(1),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const ids = await setRulesEnabled({
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

  deleteRules: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ruleIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const ids = await deleteRulesService({
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

  createRule: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().trim().min(1),
        targetObject: EvaluationRuleObjectSchema,
        filter: z.array(singleFilter).nullable(),
        sampling: z.number().gt(0).lte(1),
        enabled: z.boolean(),
        evaluatorId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const evaluationRule = await createRule({
        prisma: ctx.prisma,
        projectId: input.projectId,
        createdByUserId: ctx.session.user.id,
        name: input.name,
        targetObject: input.targetObject,
        filter: input.filter ?? [],
        sampling: input.sampling,
        enabled: input.enabled,
        evaluatorId: input.evaluatorId,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: input.evaluatorId ?? evaluationRule.id,
        action: "create",
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { id: evaluationRule.id };
    }),

  attachEvaluatorToRule: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        ruleId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await attachEvaluatorToRule({
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

  detachEvaluatorFromRule: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        ruleId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const result = await detachEvaluatorFromRule({
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

  activateEvaluator: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        evaluatorId: z.string(),
        rule: EvaluatorActivationRuleSchema,
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
        createdByUserId: ctx.session.user.id,
        evaluatorId: input.evaluatorId,
        rule: input.rule,
      });
      await invalidateProjectEvalConfigCaches(input.projectId);

      return result;
    }),

  createEvaluator: protectedProjectProcedure
    .input(CreateEvaluatorSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      // 1. Resolve the evaluation rule (reused or newly saved)
      let ruleId: string | null = null;
      let ruleValues: {
        targetObject: string;
        filter: z.infer<typeof singleFilter>[];
        sampling: number;
        delay: number;
      };

      if (input.rule.mode === "existing") {
        const existingRule = await ctx.prisma.evalRunScope.findFirst({
          where: { id: input.rule.ruleId, projectId: input.projectId },
        });
        if (!existingRule) {
          throw new LangfuseNotFoundError("Evaluation rule not found");
        }
        ruleId = existingRule.id;
        ruleValues = {
          targetObject: existingRule.targetObject,
          filter: z.array(singleFilter).parse(existingRule.filter),
          sampling: existingRule.sampling.toNumber(),
          delay: existingRule.delay,
        };
      } else if (input.rule.mode === "none") {
        // Draft: keep the config on the job so it isn't lost, create no rule.
        ruleValues = {
          targetObject: input.rule.targetObject,
          filter: input.rule.filter ?? [],
          sampling: input.rule.sampling,
          delay: 30_000,
        };
      } else {
        // Prototype: keep search-bar-produced filters as-is when they don't
        // pass strict trace-column validation.
        const filterValidation = validateEvaluatorFiltersForTarget({
          targetObject: input.rule.targetObject,
          filter: input.rule.filter ?? [],
        });
        const filter = filterValidation.isValid
          ? (filterValidation.validatedFilters ?? [])
          : (input.rule.filter ?? []);
        if (!filterValidation.isValid) {
          logger.info(
            "evalsV2.createEvaluator: storing filter without strict validation",
            { issues: filterValidation.issues },
          );
        }

        ruleValues = {
          targetObject: input.rule.targetObject,
          filter,
          sampling: input.rule.sampling,
          delay: input.rule.delay,
        };

        try {
          const rule = await ctx.prisma.evalRunScope.create({
            data: {
              projectId: input.projectId,
              createdByUserId: ctx.session.user.id,
              name: input.rule.name,
              targetObject: input.rule.targetObject,
              filter: filter,
              sampling: input.rule.sampling,
              delay: input.rule.delay,
            },
          });
          ruleId = rule.id;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new LangfuseConflictError(
              `An evaluation rule named "${input.rule.name}" already exists — reuse it instead.`,
            );
          }
          throw error;
        }
      }

      // A rule-less draft can never run — force it inactive.
      const status =
        input.rule.mode === "none" ? JobConfigState.INACTIVE : input.status;

      // Backfill only applies to live observation-rule rules. Count the
      // matches first so an over-limit request fails before anything exists.
      const backfill =
        input.backfill &&
        status === JobConfigState.ACTIVE &&
        ruleValues.targetObject === "event"
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
            ...ruleValues.filter,
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
        : ruleValues.filter;
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
            targetObject: ruleValues.targetObject,
            filter: ruleValues.filter,
            variableMapping: input.mapping,
            sampling: ruleValues.sampling,
            delay: ruleValues.delay,
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

        if (ruleId) {
          await tx.evalRunScopeAssignment.create({
            data: {
              jobConfigurationId: createdJob.id,
              runScopeId: ruleId,
            },
          });
        }
        return createdJob;
      });

      if (status === JobConfigState.ACTIVE) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }

      // 4. Backfill: evaluate the rule's existing matches in [from, to] once,
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

      return { id: job.id, ruleId };
    }),

  // Sample observation for the setup form, read from the events table — the
  // same store the rule preview lists, so every previewed row resolves.
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
