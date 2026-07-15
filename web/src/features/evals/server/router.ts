import { z } from "zod";
import {
  authenticatedProcedure,
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DEFAULT_TRACE_JOB_DELAY,
  deriveEvaluatorDisplayStateFromExecutionCounts,
  type OrderByState,
  singleFilter,
  variableMapping,
  observationVariableMapping,
  paginationZod,
  type JobConfiguration,
  JobType,
  Prisma,
  JobTimeScopeZod,
  TimeScopeSchema,
  JobConfigState,
  EvaluatorBlockReason,
  orderBy,
  jsonSchema,
  EvalTargetObject,
  EvalTargetObjectSchema,
  validateEvaluatorFiltersForTarget,
  InvalidRequestError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  EvalTemplateType,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";
import {
  getQueue,
  getAvgCostByEvaluatorIds,
  getCostByEvaluatorIds,
  getEvaluatorExecutionStatusCountsByEvaluatorId,
  getScoresByIds,
  logger,
  QueueName,
  QueueJobs,
  tableColumnsToSqlFilterAndPrefix,
  orderByToPrismaSql,
  invalidateProjectEvalConfigCaches,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { EvaluatorStatus } from "../types";
import { traceException } from "@langfuse/shared/src/server";
import { assertUnreachable, isNotNullOrUndefined } from "@/src/utils/types";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/src/env.mjs";
import { type JobExecution, type PrismaClient } from "@prisma/client";
import {
  evalConfigFilterColumns,
  evalConfigsTableCols,
} from "@/src/server/api/definitions/evalConfigsTable";
import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";
import {
  resetEvalConfigBlockFields,
  selectDatasetEvaluatorsForStatusChange,
  shouldValidateBeforeActivation,
} from "@/src/features/evals/server/evalConfigState";
import {
  EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
  JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
} from "@/src/features/evals/server/audit-log-resource-types";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";
import {
  CodeEvalTestRunSetupError,
  runCodeEvalTest,
} from "@/src/features/evals/server/codeEvalTestRun";
import {
  assertCodeEvalJobConfigCanRun,
  CodeEvalJobConfigError,
} from "@/src/features/evals/server/codeEvalJobConfigValidation";
import {
  CreateEvalTemplateInputSchema,
  validateEvalTemplateCreation,
} from "@/src/features/evals/server/evalTemplateCreation";
import {
  deleteEvalTemplateFamily,
  findEvalTemplateFamilyUsage,
} from "@/src/features/evals/server/evalTemplateDeletion";
import { CODE_EVAL_TEMPLATE_VARIABLES } from "@langfuse/shared";
import {
  getCodeEvalCapabilities,
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import {
  getEvalTemplateVariables,
  prepareConfigsForTemplateUpgrade,
  prepareVariableMappingForEvaluatorUpgrade,
} from "@/src/features/evals/server/evaluatorUpgrade";
export { CreateEvalTemplateInputSchema } from "@/src/features/evals/server/evalTemplateCreation";

// Filter columns that used to be backed by the Postgres `traces` and
// `scores` JOINs.  Those tables now live in ClickHouse, so the eval logs
// query can no longer resolve them.  Filters referencing these columns are
// dropped server-side to keep bookmarked URLs from failing.
const DEPRECATED_FILTER_COLUMNS = new Set(["scoreValue", "sessionId"]);

const ConfigWithTemplateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  evalTemplateId: z.string(),
  scoreName: z.string(),
  targetObject: EvalTargetObjectSchema,
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  // Accept either full variableMapping (trace/dataset) or simplified observationVariableMapping (event/experiment)
  variableMapping: z.union([
    z.array(variableMapping),
    z.array(observationVariableMapping),
  ]),
  sampling: z.instanceof(Prisma.Decimal),
  delay: z.number(),
  status: z.enum(JobConfigState),
  blockedAt: z.date().nullable(),
  blockReason: z.enum(EvaluatorBlockReason).nullable(),
  blockMessage: z.string().nullable(),
  jobType: z.enum(JobType),
  createdAt: z.date(),
  updatedAt: z.date(),
  timeScope: TimeScopeSchema,
  evalTemplate: z
    .object({
      name: z.string(),
      partner: z.string().nullable(),
      id: z.string(),
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      projectId: z.string().nullable(),
      prompt: z.string().nullable(),
      provider: z.string().nullable(),
      model: z.string().nullable(),
      modelParams: jsonSchema.nullable(),
      vars: z.array(z.string()),
      outputDefinition: jsonSchema.nullable(),
      version: z.number(),
      type: z.enum(EvalTemplateType),
    })
    .nullish(),
});

type EvalJobConfigWithTemplate = z.infer<typeof ConfigWithTemplateSchema>;

/**
 * Use this function when pulling a list of evaluators from the database before using in the application to ensure type safety.
 * All evaluators are expected to pass the validation. If an evaluator fails validation, it will be logged to Otel.
 * @param evaluators
 * @returns list of validated evaluators
 */
const filterAndValidateDbEvaluatorList = (
  evaluators: JobConfiguration[],
  onParseError?: (error: z.ZodError) => void,
): EvalJobConfigWithTemplate[] =>
  evaluators.reduce((acc, ts) => {
    const result = ConfigWithTemplateSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      console.error("Evaluator parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as EvalJobConfigWithTemplate[]);

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

const getSupportedCodeEvalTemplateLanguages =
  (): EvalTemplateSourceCodeLanguage[] => {
    const capabilities = getCodeEvalCapabilities();

    return capabilities.enabled
      ? capabilities.supportedSourceCodeLanguages
      : [];
  };

const getCodeEvalTemplateWhere = (): Prisma.EvalTemplateWhereInput => {
  const supportedLanguages = getSupportedCodeEvalTemplateLanguages();

  if (supportedLanguages.length === 0) {
    return { type: { not: EvalTemplateType.CODE } };
  }

  return {
    AND: [
      {
        OR: [
          { type: { not: EvalTemplateType.CODE } },
          {
            sourceCodeLanguage: {
              in: supportedLanguages,
            },
          },
        ],
      },
    ],
  };
};

const assertCodeEvalEnabled = () => {
  if (!isCodeEvalEnabled()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Code evals are not enabled",
    });
  }
};

const getCodeEvalTemplateRawSqlCondition = () => {
  const supportedLanguages = getSupportedCodeEvalTemplateLanguages();

  if (supportedLanguages.length === 0) {
    return Prisma.sql`AND type != ${EvalTemplateType.CODE}::"EvalTemplateType"`;
  }

  const supportedLanguageSql = Prisma.join(
    supportedLanguages.map(
      (language) => Prisma.sql`${language}::"EvalTemplateSourceCodeLanguage"`,
    ),
  );

  return Prisma.sql`AND (type != ${EvalTemplateType.CODE}::"EvalTemplateType" OR source_code_language IN (${supportedLanguageSql}))`;
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

const validateEvalTemplateCanRun = async ({
  prisma,
  projectId,
  evalTemplateId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evalTemplateId: string;
}) => {
  const template = await prisma.evalTemplate.findFirst({
    where: {
      id: evalTemplateId,
      OR: [{ projectId }, { projectId: null }],
    },
  });

  if (!template) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Evaluator template not found",
    });
  }

  const error = await getEvaluatorDefinitionPreflightError({
    projectId,
    template: {
      name: template.name,
      type: template.type,
      provider: template.provider,
      model: template.model,
      modelParams: template.modelParams,
      outputDefinition: template.outputDefinition,
    },
  });

  if (error) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error,
    });
  }
};

const assertCodeEvalJobConfigCanRunForTRPC = async ({
  prisma,
  orgId,
  projectId,
  evalTemplateId,
  target,
  mapping,
  scoreName,
  filter,
}: {
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
    await assertCodeEvalJobConfigCanRun({
      prisma,
      orgId,
      projectId,
      evalTemplateId,
      target,
      mapping,
      scoreName,
      filter,
    });
  } catch (error) {
    if (error instanceof CodeEvalJobConfigError) {
      throw toCodeEvalJobConfigTRPCError(error);
    }

    throw error;
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

function toCodeEvalTRPCError(error: CodeEvalTestRunSetupError) {
  switch (error.code) {
    case "TEMPLATE_NOT_FOUND":
    case "OBSERVATION_NOT_FOUND":
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
        scope: "evalJob:read",
      });
      return env.LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT;
    }),
  counts: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:read",
      });

      const [configCount, configActiveCount, templateCount, legacyConfigCount] =
        await Promise.all([
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
          ctx.prisma.jobConfiguration.count({
            where: {
              projectId: input.projectId,
              jobType: "EVAL",
              targetObject: {
                in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
              },
            },
          }),
        ]);

      return {
        configCount,
        configActiveCount,
        templateCount,
        legacyConfigCount,
      };
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
        scope: "evalJob:read",
      });

      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        evalConfigFilterColumns,
        "job_configurations",
      );

      const orderByCondition = getEvaluatorConfigsOrderByCondition(
        input.orderBy,
      );

      const searchCondition =
        input.searchQuery && input.searchQuery.trim() !== ""
          ? Prisma.sql`AND jc.score_name ILIKE ${`%${input.searchQuery}%`}`
          : Prisma.empty;

      const [configs, configsCount] = await Promise.all([
        // job configs with their templates
        ctx.prisma.$queryRaw<
          Array<
            Omit<
              JobConfiguration,
              "projectId" | "jobType" | "variableMapping" | "sampling" | "delay"
            > & {
              blockedAt: Date | null;
              blockReason: EvaluatorBlockReason | null;
              blockMessage: string | null;
              templateName: string;
              templateVersion: number;
              templateProjectId: string;
            }
          >
        >(
          generateConfigsQuery(
            Prisma.sql`
            jc.id,
            jc.status,
            jc.blocked_at as "blockedAt",
            jc.block_reason as "blockReason",
            jc.block_message as "blockMessage",
            jc.created_at as "createdAt",
            jc.updated_at as "updatedAt",
            jc.score_name as "scoreName",
            jc.target_object as "targetObject",
            jc.filter as "filter",
            jc.time_scope as "timeScope",
            et.id as "evalTemplateId",
            et.name as "templateName",
            et.version as "templateVersion",
            et.project_id as "templateProjectId"`,
            input.projectId,
            filterCondition,
            searchCondition,
            orderByCondition,
            input.limit,
            input.page,
          ),
        ),
        // count
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generateConfigsQuery(
            Prisma.sql`count(*) AS "totalCount"`,
            input.projectId,
            filterCondition,
            searchCondition,
            Prisma.empty,
            1, // limit
            0, // page
          ),
        ),
      ]);

      return {
        configs: configs.map((config) => ({
          ...config,
          evalTemplate: config.evalTemplateId
            ? {
                id: config.evalTemplateId,
                name: config.templateName,
                version: config.templateVersion,
                projectId: config.templateProjectId,
              }
            : null,
          displayStatus: deriveEvaluatorDisplayStateFromExecutionCounts({
            status: config.status,
            blockedAt: config.blockedAt,
            timeScope: Array.isArray(config.timeScope) ? config.timeScope : [],
            executionCounts: [],
          }),
        })),
        totalCount:
          configsCount.length > 0 ? Number(configsCount[0]?.totalCount) : 0,
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
        scope: "evalTemplate:read",
      });

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          name: input.name,
          ...(input.isUserManaged
            ? { projectId: input.projectId }
            : { projectId: null }),
          ...getCodeEvalTemplateWhere(),
        },
        orderBy: [{ version: "desc" }],
      });

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
        scope: "evalTemplate:read",
      });

      const searchCondition =
        input.searchQuery && input.searchQuery.trim() !== ""
          ? Prisma.sql`AND name ILIKE ${`%${input.searchQuery}%`}`
          : Prisma.empty;
      const typeCondition = getCodeEvalTemplateRawSqlCondition();

      const [templates, count] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<{
            latestId: string;
            name: string;
            projectId: string;
            version: number;
            latestCreatedAt: Date;
            usageCount: number;
            partner?: string;
            provider?: string;
            model?: string;
            type: EvalTemplateType;
            sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
            outputDefinition: unknown;
          }>
        >`
        WITH latest_templates AS (
          SELECT 
            et.id,
            et.name,
            et.project_id,
            et.provider,
            et.model,
            et.type,
            et.source_code_language,
            et.partner,
            et.version,
            et.created_at,
            et.output_schema,
            (
              SELECT COUNT(jc.id)
              FROM job_configurations jc
              WHERE jc.eval_template_id IN (
                SELECT id 
                FROM eval_templates 
                WHERE name = et.name AND 
                      type = et.type AND
                      (project_id = et.project_id OR (project_id IS NULL AND et.project_id IS NULL))
              )
              AND jc.project_id = ${input.projectId}
            ) as usage_count
          FROM (
            SELECT DISTINCT ON (project_id, name, type) *
            FROM eval_templates
            WHERE (project_id = ${input.projectId} OR project_id IS NULL)
            ${searchCondition}
            ${typeCondition}
            ORDER BY project_id, name, type, version DESC
          ) et
        )
        SELECT 
          id as "latestId",
          name,
          provider,
          model,
          type,
          source_code_language as "sourceCodeLanguage",
          partner,
          project_id as "projectId",
          version,
          created_at as "latestCreatedAt",
          output_schema as "outputDefinition",
          COALESCE(usage_count, 0)::int as "usageCount"
        FROM 
          latest_templates
        ORDER BY project_id, partner, name, type
        LIMIT ${input.limit}
        OFFSET ${input.page * input.limit}
        `,
        ctx.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*) as count
          FROM (
            SELECT DISTINCT project_id, name, type
            FROM eval_templates
            WHERE (project_id = ${input.projectId} OR project_id IS NULL)
            ${searchCondition}
            ${typeCondition}
          ) t
        `,
      ]);

      return {
        templates,
        totalCount: Number(count[0]?.count) || 0,
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const template = await ctx.prisma.evalTemplate.findFirst({
        where: {
          id: input.id,
          OR: [{ projectId: input.projectId }, { projectId: null }],
          ...getCodeEvalTemplateWhere(),
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
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalTemplate:read",
      });

      const templates = await ctx.prisma.evalTemplate.findMany({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
          ...(input.id ? { id: input.id } : undefined),
          ...getCodeEvalTemplateWhere(),
        },
        orderBy: [{ name: "asc" }, { version: "asc" }],
        ...(input.limit && input.page
          ? { take: input.limit, skip: input.page * input.limit }
          : undefined),
      });

      const count = await ctx.prisma.evalTemplate.count({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
          ...(input.id ? { id: input.id } : undefined),
          ...getCodeEvalTemplateWhere(),
        },
      });
      return {
        templates: templates,
        totalCount: count,
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
        scope: "evalTemplate:read",
      });

      // distinct keeps the first row per family under this orderBy, i.e. the
      // latest version (dedupe happens in the Prisma engine, not in SQL)
      const latestTemplates = await ctx.prisma.evalTemplate.findMany({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
          ...getCodeEvalTemplateWhere(),
        },
        orderBy: [
          { name: "asc" },
          { type: "asc" },
          { projectId: { sort: "asc", nulls: "first" } },
          { version: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        distinct: ["projectId", "name", "type"],
      });

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
        scope: "evalJob:read",
      });

      const targetObjects = Array.isArray(input.targetObject)
        ? input.targetObject
        : [input.targetObject];

      const evaluators = await ctx.prisma.jobConfiguration.findMany({
        where: {
          projectId: input.projectId,
          targetObject: { in: targetObjects },
        },
        include: {
          evalTemplate: true,
        },
      });

      return filterAndValidateDbEvaluatorList(evaluators, traceException);
    }),

  jobConfigsByTemplateName: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateName: z.string() }))
    .query(async ({ input, ctx }) => {
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
    }),

  createJob: protectedProjectProcedure
    .input(CreateEvalJobSchema)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "evalJob:CUD",
      });

      const evalTemplate = await ctx.prisma.evalTemplate.findFirst({
        where: {
          id: input.evalTemplateId,
          OR: [{ projectId: input.projectId }, { projectId: null }],
        },
      });

      if (!evalTemplate) {
        logger.warn(
          `Template not found for project ${input.projectId} and id ${input.evalTemplateId}`,
        );
        throw new Error("Template not found");
      }
      const latestEvalTemplate = await ctx.prisma.evalTemplate.findFirst({
        where: {
          projectId: evalTemplate.projectId,
          name: evalTemplate.name,
          type: evalTemplate.type,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      });
      const resolvedEvalTemplate = latestEvalTemplate ?? evalTemplate;

      if (resolvedEvalTemplate.id !== evalTemplate.id) {
        logger.info(
          `Resolved stale evaluator template ${evalTemplate.id} to latest version ${resolvedEvalTemplate.id} for project ${input.projectId}`,
        );
      }

      if (resolvedEvalTemplate.type === EvalTemplateType.CODE) {
        assertCodeEvalTemplateCanRun({
          sourceCodeLanguage: resolvedEvalTemplate.sourceCodeLanguage,
        });
      }

      const variableMappingForTarget = validateVariableMappingForTarget({
        targetObject: input.target,
        mapping: input.mapping,
      });
      const variableMappingForResolvedTemplate = (() => {
        if (resolvedEvalTemplate.id === evalTemplate.id) {
          return variableMappingForTarget;
        }

        const preparedMapping = prepareVariableMappingForEvaluatorUpgrade({
          templateType: resolvedEvalTemplate.type,
          targetObject: input.target,
          variableMapping: variableMappingForTarget,
          nextVariables: getEvalTemplateVariables(resolvedEvalTemplate),
        });

        if (preparedMapping.missingVariables.length > 0) {
          throw new LangfuseConflictError(
            `Evaluator template "${evalTemplate.name}" changed while this form was open. Reload the page and configure the latest version before creating this evaluator. Missing mappings: ${preparedMapping.missingVariables.join(", ")}.`,
          );
        }

        return preparedMapping.variableMapping;
      })();
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

      if (resolvedEvalTemplate.type === EvalTemplateType.CODE) {
        await assertCodeEvalJobConfigCanRunForTRPC({
          prisma: ctx.prisma,
          orgId: ctx.session.orgId,
          projectId: input.projectId,
          evalTemplateId: resolvedEvalTemplate.id,
          target: input.target,
          mapping: variableMappingForResolvedTemplate,
          scoreName: input.scoreName,
          filter: validatedFilter ?? [],
        });
      }

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
          evalTemplateId: resolvedEvalTemplate.id,
          scoreName: input.scoreName,
          targetObject: input.target,
          filter: validatedFilter ?? [],
          variableMapping: variableMappingForResolvedTemplate,
          sampling: input.sampling,
          delay: input.delay,
          status: input.status,
          timeScope: input.timeScope,
        },
      });

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
        scope: "evalJob:CUD",
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
        scope: "evalTemplate:CUD",
      });

      await validateEvalTemplateCreation(input);

      const result = await ctx.prisma.$transaction(async (tx) => {
        const nextVariables = getEvalTemplateVariables(input);
        const existingProjectTemplatesByName = await tx.evalTemplate.findMany({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            name: true,
            type: true,
            version: true,
          },
        });
        const existingProjectTemplates = existingProjectTemplatesByName.filter(
          (template) => template.type === input.type,
        );
        // "open it to create a new version" is a dead end when the name is
        // taken by a template of a different type (type cannot change)
        const throwTemplateNameConflict = () => {
          throw new LangfuseConflictError(
            existingProjectTemplates.length > 0
              ? `An evaluator named "${input.name}" already exists in this project. Open it to create a new version.`
              : `An evaluator named "${input.name}" already exists in this project with a different type. Use a different name.`,
          );
        };

        let templateIdsWhoseConfigsShouldMove: string[] = [];

        switch (input.intent) {
          case "new": {
            if (existingProjectTemplatesByName.length > 0) {
              throwTemplateNameConflict();
            }
            break;
          }
          case "new-version": {
            const sourceTemplate = existingProjectTemplates.find(
              (template) => template.id === input.sourceTemplateId,
            );

            if (!sourceTemplate) {
              throw new LangfuseNotFoundError("Evaluator not found");
            }

            templateIdsWhoseConfigsShouldMove = existingProjectTemplates.map(
              (template) => template.id,
            );
            break;
          }
          case "clone": {
            const cloneSourceTemplate = await tx.evalTemplate.findFirst({
              where: {
                id: input.cloneSourceId,
                projectId: null,
              },
            });

            if (!cloneSourceTemplate) {
              throw new LangfuseNotFoundError(
                "Langfuse managed template not found",
              );
            }
            if (cloneSourceTemplate.type !== input.type) {
              throw new InvalidRequestError(
                "Evaluator type cannot be changed.",
              );
            }
            if (existingProjectTemplatesByName.length > 0) {
              throwTemplateNameConflict();
            }

            if (input.retargetUsingJobConfigs) {
              // Clone retargeting is opt-in from the dialog: move this project's
              // configs that currently point at the managed source family to the
              // newly cloned project template.
              const cloneSourceTemplateList = await tx.evalTemplate.findMany({
                where: {
                  projectId: null,
                  name: cloneSourceTemplate.name,
                  type: cloneSourceTemplate.type,
                },
                select: {
                  id: true,
                },
              });
              templateIdsWhoseConfigsShouldMove = cloneSourceTemplateList.map(
                (template) => template.id,
              );
            }
            break;
          }
          default:
            assertUnreachable(input);
        }

        const configsToUpgrade =
          templateIdsWhoseConfigsShouldMove.length > 0
            ? await tx.jobConfiguration.findMany({
                where: {
                  projectId: input.projectId,
                  evalTemplateId: {
                    in: templateIdsWhoseConfigsShouldMove,
                  },
                  evalTemplate: {
                    is: {
                      type: input.type,
                    },
                  },
                },
                select: {
                  id: true,
                  scoreName: true,
                  targetObject: true,
                  variableMapping: true,
                },
              })
            : [];
        const upgradedConfigs = prepareConfigsForTemplateUpgrade({
          templateType: input.type,
          configs: configsToUpgrade,
          nextVariables,
        });

        const latestTemplate = existingProjectTemplatesByName[0];
        const baseTemplateData = {
          version: (latestTemplate?.version ?? 0) + 1,
          name: input.name,
          projectId: input.projectId,
        };

        const evalTemplate = await (async () => {
          switch (input.type) {
            case EvalTemplateType.CODE:
              return tx.evalTemplate.create({
                data: {
                  ...baseTemplateData,
                  type: EvalTemplateType.CODE,
                  prompt: null,
                  provider: null,
                  model: null,
                  modelParams: undefined,
                  vars: [...CODE_EVAL_TEMPLATE_VARIABLES],
                  outputDefinition: undefined,
                  sourceCode: input.sourceCode,
                  sourceCodeLanguage: input.sourceCodeLanguage,
                },
              });
            case EvalTemplateType.LLM_AS_JUDGE:
              return tx.evalTemplate.create({
                data: {
                  ...baseTemplateData,
                  type: EvalTemplateType.LLM_AS_JUDGE,
                  prompt: input.prompt,
                  // if using default model, leave model, provider and modelParams empty
                  // otherwise we will not pull the most recent default evaluation model
                  provider: input.provider,
                  model: input.model,
                  modelParams: input.modelParams ?? undefined,
                  vars: input.vars,
                  outputDefinition: input.outputDefinition,
                  sourceCode: null,
                  sourceCodeLanguage: null,
                },
              });
            default:
              return assertUnreachable(input);
          }
        })();

        if (upgradedConfigs.length > 0) {
          await Promise.all(
            upgradedConfigs.map((config) =>
              tx.jobConfiguration.update({
                where: {
                  id: config.id,
                  projectId: input.projectId,
                },
                data: {
                  evalTemplateId: evalTemplate.id,
                  variableMapping: config.variableMapping,
                },
              }),
            ),
          );
        }

        await auditLog({
          session: ctx.session,
          resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: evalTemplate.id,
          action: "create",
        });

        return {
          template: evalTemplate,
          updatedConfigCount: upgradedConfigs.length,
        };
      });

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
          scope: "evalJob:CUD",
        });

        const evaluators = await ctx.prisma.jobConfiguration.findMany({
          where: {
            projectId: projectId,
            evalTemplateId: evalTemplateId,
            // the experiment selector creates EXPERIMENT-target configs; DATASET
            // is the legacy shape — the toggle must reach both
            targetObject: {
              in: [EvalTargetObject.DATASET, EvalTargetObject.EXPERIMENT],
            },
            ...(newStatus === JobConfigState.ACTIVE
              ? {
                  OR: [
                    { status: JobConfigState.INACTIVE },
                    {
                      status: JobConfigState.ACTIVE,
                      blockedAt: { not: null },
                    },
                  ],
                }
              : {
                  status: JobConfigState.ACTIVE,
                }),
          },
        });

        const filteredEvaluators = selectDatasetEvaluatorsForStatusChange({
          evaluators,
          datasetId,
          newStatus,
        });

        if (
          newStatus === JobConfigState.ACTIVE &&
          filteredEvaluators.length > 0
        ) {
          await validateEvalTemplateCanRun({
            prisma: ctx.prisma,
            projectId,
            evalTemplateId,
          });
        }

        const filteredEvaluatorIds = filteredEvaluators.map(
          (evaluator) => evaluator.id,
        );

        await ctx.prisma.$transaction(async (tx) => {
          await tx.jobConfiguration.updateMany({
            where: {
              id: { in: filteredEvaluatorIds },
            },
            data: {
              status: newStatus,
              ...resetEvalConfigBlockFields,
            },
          });
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
        scope: "evalJob:CUD",
      });

      const existingJob = await ctx.prisma.jobConfiguration.findUnique({
        where: {
          id: evalConfigId,
          projectId: projectId,
        },
        include: {
          evalTemplate: true,
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

      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evalConfigId,
        action: "update",
      });

      if (
        shouldValidateBeforeActivation({
          currentStatus: existingJob.status,
          blockedAt: existingJob.blockedAt,
          nextStatus: config.status,
        })
      ) {
        if (!existingJob.evalTemplateId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Evaluator template not found",
          });
        }

        await validateEvalTemplateCanRun({
          prisma: ctx.prisma,
          projectId,
          evalTemplateId: existingJob.evalTemplateId,
        });
      }

      const updatedConfig = {
        ...validatedConfig,
        ...(config.filter !== undefined
          ? {
              filter: validatedFilter ?? [],
            }
          : {}),
        ...(validatedConfig.status !== undefined
          ? resetEvalConfigBlockFields
          : {}),
      };

      const updatedJob = await ctx.prisma.jobConfiguration.update({
        where: {
          id: evalConfigId,
          projectId: projectId,
        },
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

      await ctx.prisma.jobConfiguration.delete({
        where: {
          id: evalConfigId,
          projectId: projectId,
        },
      });

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
        scope: "evalJob:read",
      });

      return findEvalTemplateFamilyUsage({
        prisma: ctx.prisma,
        projectId,
        evalTemplateId,
      });
    }),

  deleteEvalTemplate: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), evalTemplateId: z.string() }))
    .mutation(async ({ ctx, input: { projectId, evalTemplateId } }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: projectId,
        scope: "evalTemplate:CUD",
      });

      const deletedVersions = await deleteEvalTemplateFamily({
        prisma: ctx.prisma,
        projectId,
        evalTemplateId,
      });

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
            input.jobConfigurationId,
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
            input.jobConfigurationId,
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
        scope: "evalJob:read",
      });

      if (input.evaluatorIds.length === 0) {
        return {};
      }

      return getEvaluatorExecutionStatusCountsByEvaluatorId({
        prisma: ctx.prisma,
        projectId: input.projectId,
        evaluatorIds: input.evaluatorIds,
      });
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
        scope: "evalJob:read",
      });

      const costs = await getCostByEvaluatorIds(
        input.projectId,
        input.evaluatorIds,
      );

      // Convert array to map for easier lookup
      return costs.reduce(
        (acc, { evaluatorId, totalCost }) => {
          acc[evaluatorId] = totalCost;
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
        scope: "evalJob:read",
      });

      const costs = await getAvgCostByEvaluatorIds(
        input.projectId,
        input.evaluatorIds,
      );

      return costs.reduce(
        (acc, { evaluatorId, avgCost, executionCount }) => {
          acc[evaluatorId] = { avgCost, executionCount };
          return acc;
        },
        {} as Record<string, { avgCost: number; executionCount: number }>,
      );
    }),
});

const generateConfigsQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  searchCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
   FROM job_configurations jc
   LEFT JOIN eval_templates et ON jc.eval_template_id = et.id AND (jc.project_id = et.project_id OR et.project_id IS NULL)
   WHERE jc.project_id = ${projectId}
   AND jc.job_type = 'EVAL'
   ${filterCondition}
   ${searchCondition}
   ${orderCondition}
   LIMIT ${limit} OFFSET ${page * limit};
  `;
};

const getEvaluatorConfigsOrderByCondition = (orderByState: OrderByState) => {
  const orderByCondition = orderByToPrismaSql(
    orderByState,
    evalConfigsTableCols,
  );

  if (orderByState?.column !== "status" && orderByState?.column !== "Status") {
    return orderByCondition;
  }

  return Prisma.sql`${orderByCondition}, jc.created_at DESC`;
};

const generateExecutionsQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
  jobConfigurationId?: string,
) => {
  const configCondition = jobConfigurationId
    ? Prisma.sql`AND je.job_configuration_id = ${jobConfigurationId}`
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
