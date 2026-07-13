import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
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
  invalidateProjectEvalConfigCaches,
  logger,
} from "@langfuse/shared/src/server";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
  JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
} from "@/src/features/evals/server/audit-log-resource-types";
import {
  DEFAULT_OUTPUT_DEFINITION,
  runLlmJudgeTest,
} from "@/src/features/evals/v2/server/testRunLlmJudge";

const ScopeTargetObjectSchema = z
  .enum(["trace", "event", "experiment"])
  .default("trace");

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
  mapping: z.array(variableMapping),
  traceId: z.string(),
  traceTimestamp: z.coerce.date().optional(),
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
          scoreName: input.scoreName,
          description: input.description ?? null,
          targetObject: scopeValues.targetObject,
          filter: scopeValues.filter,
          variableMapping: input.mapping,
          sampling: scopeValues.sampling,
          delay: scopeValues.delay,
          status: input.status,
          timeScope: ["NEW"],
          runScopeId,
        },
      });

      if (input.status === JobConfigState.ACTIVE) {
        await invalidateProjectEvalConfigCaches(input.projectId);
      }

      return { id: job.id, runScopeId };
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

      return runLlmJudgeTest({
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
        traceId: input.traceId,
        traceTimestamp: input.traceTimestamp,
      });
    }),
});

async function createProjectTemplate(
  prisma: PrismaClient,
  data: {
    projectId: string;
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
