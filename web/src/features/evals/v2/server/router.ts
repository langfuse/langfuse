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
  // Optional custom name for the written scores — scoreName (the evaluator
  // name) is used when absent.
  scoreNameOverride: z.string().trim().min(1).nullish(),
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
          _count: { select: { jobConfigurations: true } },
          jobConfigurations: {
            select: { scoreName: true },
            take: 5,
          },
        },
      });

      return scopes.map((scope) => ({
        ...scope,
        sampling: scope.sampling.toNumber(),
        filter: z.array(singleFilter).catch([]).parse(scope.filter),
      }));
    }),

  // True sharing: updating a scope propagates filter + sampling to every
  // evaluator (job configuration) that references it.
  updateRunScope: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        runScopeId: z.string(),
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

      const filter = input.filter ?? [];
      await ctx.prisma.$transaction([
        ctx.prisma.evalRunScope.update({
          where: { id: scope.id },
          data: { filter, sampling: input.sampling },
        }),
        ctx.prisma.jobConfiguration.updateMany({
          where: { projectId: input.projectId, runScopeId: scope.id },
          data: { filter, sampling: input.sampling },
        }),
      ]);
      await invalidateProjectEvalConfigCaches(input.projectId);

      return { id: scope.id };
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

      const job = await ctx.prisma.jobConfiguration.create({
        data: {
          id: jobId,
          projectId: input.projectId,
          jobType: "EVAL",
          evalTemplateId,
          scoreName: input.scoreNameOverride ?? input.scoreName,
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
          runScopeId,
        },
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
