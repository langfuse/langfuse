import {
  EvalTemplateType,
  Prisma,
  type PrismaClient,
  type EvaluatorBlockReason,
} from "@langfuse/shared/src/db";
import type {
  CreateEvaluatorInput,
  EvaluatorDefinitionForPersistence,
  EvaluatorListOrderBy,
} from "./evaluatorTypes";
import { EvaluatorVersionConflictError } from "./evaluatorErrors";
import { setRuleStatus } from "../rules/ruleRepository";
import {
  EvalTargetObject,
  eventsEvalFilterColumns,
  validateEvaluatorFiltersForTarget,
  type FilterState,
} from "@langfuse/shared";
import {
  compilePrismaFilters,
  stringFilterToPrisma,
  stringOptionsFilterToPrisma,
  type PrismaFilterColumnHandlers,
} from "@langfuse/shared/src/server";
import { creatorOptionsWhere, creatorWhere } from "../creatorFilterPrisma";

type PrismaTransaction = Prisma.TransactionClient;

const createdByUser = {
  select: { id: true, name: true, email: true },
} as const;

const latestVersion = {
  orderBy: { version: "desc" as const },
  take: 1,
};

const latestVersionWithCreator = {
  ...latestVersion,
  include: { createdByUser },
};

const eventEvaluatorFilterColumnIds = new Set(
  eventsEvalFilterColumns.map((column) => column.id),
);

const publicEvaluationRuleAssignments = (projectId: string) =>
  ({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      variableMapping: true,
      evaluationRule: {
        select: { id: true, targetObject: true },
      },
    },
  }) satisfies Prisma.EvaluationRuleEvaluatorAssignmentFindManyArgs;

export const batchEligibleEvaluatorWhere = {
  // Trace/dataset assignments carry rule-specific mappings that an
  // observation batch cannot resolve when it addresses the evaluator alone.
  assignments: {
    none: {
      evaluationRule: {
        targetObject: {
          in: [EvalTargetObject.TRACE, EvalTargetObject.DATASET],
        },
      },
    },
  },
} satisfies Prisma.EvaluatorWhereInput;

function versionData(
  definition: EvaluatorDefinitionForPersistence,
  createdByUserId: string | null,
) {
  const commonVersionData = {
    createdByUserId,
    // Prisma distinguishes a database NULL from a JSON null value.
    variableMapping:
      definition.variableMapping === null
        ? Prisma.DbNull
        : (definition.variableMapping as Prisma.InputJsonValue),
  };

  return definition.type === EvalTemplateType.LLM_AS_JUDGE
    ? {
        ...commonVersionData,
        prompt: definition.prompt,
        promptMessages: definition.promptMessages,
        provider: definition.provider,
        model: definition.model,
        modelParams:
          definition.modelParams === null
            ? Prisma.DbNull
            : (definition.modelParams as Prisma.InputJsonValue),
        vars: definition.vars,
        outputDefinition: definition.outputDefinition as Prisma.InputJsonValue,
      }
    : {
        ...commonVersionData,
        sourceCode: definition.sourceCode,
        sourceCodeLanguage: definition.sourceCodeLanguage,
      };
}

type EvaluatorModelFilter = Extract<
  FilterState[number],
  { type: "string" | "stringOptions" }
> & { column: "model" };

function isModelFilter(
  filter: FilterState[number],
): filter is EvaluatorModelFilter {
  return (
    filter.column === "model" &&
    (filter.type === "string" || filter.type === "stringOptions")
  );
}

async function evaluatorIdsMatchingModelFilters(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  filters: EvaluatorModelFilter[];
}) {
  const effectiveModel = Prisma.sql`
    CASE
      WHEN evaluator.type = 'LLM_AS_JUDGE'
      THEN COALESCE(latest_version.model, default_model.model)
      ELSE NULL
    END
  `;
  const predicates = params.filters.map((filter) => {
    const normalizedModel = Prisma.sql`LOWER(${effectiveModel})`;
    if (filter.type === "stringOptions") {
      if (filter.value.length === 0) {
        return filter.operator === "any of"
          ? Prisma.sql`FALSE`
          : Prisma.sql`TRUE`;
      }
      const values = Prisma.join(
        filter.value.map((value) => value.toLowerCase()),
      );
      return filter.operator === "any of"
        ? Prisma.sql`${normalizedModel} IN (${values})`
        : Prisma.sql`(${effectiveModel} IS NULL OR ${normalizedModel} NOT IN (${values}))`;
    }

    const normalizedValue = filter.value.toLowerCase();
    switch (filter.operator) {
      case "=":
        return Prisma.sql`${normalizedModel} = ${normalizedValue}`;
      case "contains":
        return Prisma.sql`STRPOS(${normalizedModel}, ${normalizedValue}) > 0`;
      case "does not contain":
        return Prisma.sql`STRPOS(${normalizedModel}, ${normalizedValue}) = 0`;
      case "starts with":
        return Prisma.sql`LEFT(${normalizedModel}, LENGTH(${normalizedValue})) = ${normalizedValue}`;
      case "ends with":
        return Prisma.sql`RIGHT(${normalizedModel}, LENGTH(${normalizedValue})) = ${normalizedValue}`;
    }
  });
  const matches = await params.prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT evaluator.id
      FROM evaluators AS evaluator
      LEFT JOIN LATERAL (
        SELECT version.model
        FROM evaluator_versions AS version
        WHERE version.evaluator_id = evaluator.id
        ORDER BY version.version DESC
        LIMIT 1
      ) AS latest_version ON TRUE
      LEFT JOIN default_llm_models AS default_model
        ON default_model.project_id = evaluator.project_id
      WHERE evaluator.project_id = ${params.projectId}
        AND ${Prisma.join(predicates, " AND ")}
    `,
  );
  return matches.map(({ id }) => id);
}

async function evaluatorWhere(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  search?: string;
  filter?: FilterState;
}): Promise<Prisma.EvaluatorWhereInput> {
  const modelFilters = params.filter?.filter(isModelFilter) ?? [];
  const otherFilters = params.filter?.filter(
    (filter) => !isModelFilter(filter),
  );
  const modelEvaluatorIds =
    modelFilters.length > 0
      ? await evaluatorIdsMatchingModelFilters({
          prisma: params.prisma,
          projectId: params.projectId,
          filters: modelFilters,
        })
      : undefined;
  const handlers = {
    name: {
      string: (filter) => ({ name: stringFilterToPrisma(filter) }),
      stringOptions: (filter) => ({
        name: stringOptionsFilterToPrisma(filter),
      }),
    },
    creator: {
      string: creatorWhere,
      stringOptions: creatorOptionsWhere,
    },
    type: {
      stringOptions: (filter) => ({
        type:
          filter.operator === "any of"
            ? { in: filter.value as EvalTemplateType[] }
            : { notIn: filter.value as EvalTemplateType[] },
      }),
    },
    status: {
      stringOptions: (filter) => {
        const statuses: Prisma.EvaluatorWhereInput[] = filter.value.map(
          (status) =>
            status === "BLOCKED"
              ? { blockedAt: { not: null } }
              : status === "ACTIVE"
                ? {
                    blockedAt: null,
                    assignments: {
                      some: {
                        projectId: params.projectId,
                        evaluationRule: { status: "ACTIVE" },
                      },
                    },
                  }
                : {
                    blockedAt: null,
                    assignments: {
                      none: {
                        projectId: params.projectId,
                        evaluationRule: { status: "ACTIVE" },
                      },
                    },
                  },
        );
        return filter.operator === "any of"
          ? { OR: statuses }
          : { NOT: { OR: statuses } };
      },
    },
  } satisfies Record<
    string,
    PrismaFilterColumnHandlers<Prisma.EvaluatorWhereInput>
  >;

  return {
    projectId: params.projectId,
    ...(modelEvaluatorIds ? { id: { in: modelEvaluatorIds } } : {}),
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" as const } }
      : {}),
    AND: compilePrismaFilters<Prisma.EvaluatorWhereInput>(
      otherFilters ?? [],
      handlers,
    ),
  };
}

export async function listEvaluators(params: {
  prisma: PrismaClient;
  projectId: string;
  page: number;
  limit: number;
  orderBy?: EvaluatorListOrderBy;
  search?: string;
  filter?: FilterState;
}) {
  const where = await evaluatorWhere(params);
  const orderColumn = params.orderBy?.column ?? "updatedAt";
  const orderDirection = params.orderBy?.order.toLowerCase() ?? "desc";
  const [evaluators, totalItems, defaultModel] = await Promise.all([
    params.prisma.evaluator.findMany({
      where,
      orderBy: [{ [orderColumn]: orderDirection }, { id: "desc" }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: {
        versions: latestVersionWithCreator,
        createdByUser,
        _count: {
          select: {
            assignments: { where: { projectId: params.projectId } },
          },
        },
        assignments: {
          where: { projectId: params.projectId },
          select: {
            evaluationRule: { select: { id: true, name: true, status: true } },
          },
        },
      },
    }),
    params.prisma.evaluator.count({ where }),
    params.prisma.defaultLlmModel.findUnique({
      where: { projectId: params.projectId },
      select: { model: true },
    }),
  ]);
  return {
    evaluators: evaluators.map(({ assignments, ...evaluator }) => ({
      ...evaluator,
      assignments,
      assignedRuleIds: assignments.map(
        ({ evaluationRule }) => evaluationRule.id,
      ),
      hasActiveRules: assignments.some(
        ({ evaluationRule }) => evaluationRule.status === "ACTIVE",
      ),
      effectiveModel:
        evaluator.type === EvalTemplateType.LLM_AS_JUDGE
          ? (evaluator.versions[0]?.model ?? defaultModel?.model ?? null)
          : null,
    })),
    totalItems,
  };
}

export async function listEvaluatorsCursor(params: {
  prisma: PrismaClient;
  projectId: string;
  limit: number;
  cursor?: { createdAt: Date; id: string };
  search?: string;
}) {
  const baseWhere = await evaluatorWhere(params);
  const where: Prisma.EvaluatorWhereInput = params.cursor
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: params.cursor.createdAt } },
              {
                createdAt: params.cursor.createdAt,
                id: { lt: params.cursor.id },
              },
            ],
          },
        ],
      }
    : baseWhere;
  const records = await params.prisma.evaluator.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    include: {
      versions: latestVersionWithCreator,
      createdByUser,
      assignments: publicEvaluationRuleAssignments(params.projectId),
    },
  });
  const hasMore = records.length > params.limit;
  const evaluators = records.slice(0, params.limit);
  const last = evaluators.at(-1);
  return {
    evaluators,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : undefined,
  };
}

export async function countEvaluators(params: {
  prisma: PrismaClient;
  projectId: string;
  search?: string;
}) {
  const where = await evaluatorWhere(params);
  return params.prisma.evaluator.count({ where });
}

export async function listEvaluatorFilterOptions(params: {
  prisma: PrismaClient;
  projectId: string;
}) {
  const [evaluators, defaultModel] = await Promise.all([
    params.prisma.evaluator.findMany({
      where: { projectId: params.projectId },
      select: {
        name: true,
        type: true,
        createdByUser,
        versions: {
          ...latestVersion,
          select: { model: true },
        },
      },
    }),
    params.prisma.defaultLlmModel.findUnique({
      where: { projectId: params.projectId },
      select: { model: true },
    }),
  ]);

  return {
    name: [...new Set(evaluators.map(({ name }) => name))].sort(),
    creator: [
      ...new Set(
        evaluators.map(
          ({ createdByUser }) =>
            createdByUser?.name ?? createdByUser?.email ?? "API",
        ),
      ),
    ].sort(),
    model: [
      ...new Set(
        evaluators.flatMap(({ type, versions }) => {
          if (type !== EvalTemplateType.LLM_AS_JUDGE) return [];
          const model = versions[0]?.model ?? defaultModel?.model;
          return model ? [model] : [];
        }),
      ),
    ].sort(),
  };
}

export async function listEvaluatorIds(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  search?: string;
  filter?: FilterState;
}) {
  const where = await evaluatorWhere(params);
  const evaluators = await params.prisma.evaluator.findMany({
    where,
    select: { id: true },
  });
  return evaluators.map(({ id }) => id);
}

export function countProjectEvaluators(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorIds: string[];
}) {
  return params.prisma.evaluator.count({
    where: { projectId: params.projectId, id: { in: params.evaluatorIds } },
  });
}

export async function listEvaluatorOptions(params: {
  prisma: PrismaClient;
  projectId: string;
  search?: string;
  limit: number;
  excludeLegacyEvaluators?: boolean;
}) {
  const evaluators = await params.prisma.evaluator.findMany({
    where: {
      projectId: params.projectId,
      ...(params.search
        ? { name: { contains: params.search, mode: "insensitive" } }
        : {}),
      ...(params.excludeLegacyEvaluators ? batchEligibleEvaluatorWhere : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: params.limit,
    select: {
      id: true,
      name: true,
      type: true,
      updatedAt: true,
      createdByUser,
      blockedAt: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        // `prompt` powers the evaluator prompt previews in pickers.
        select: {
          id: true,
          version: true,
          variableMapping: true,
          prompt: true,
        },
      },
    },
  });
  return evaluators.map(({ versions, ...evaluator }) => ({
    ...evaluator,
    latestVersion: versions[0] ?? null,
  }));
}

export function findEvaluator(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorId: string;
}) {
  return params.prisma.evaluator.findFirst({
    where: { id: params.evaluatorId, projectId: params.projectId },
    include: {
      versions: latestVersionWithCreator,
      createdByUser,
      assignments: publicEvaluationRuleAssignments(params.projectId),
    },
  });
}

export async function findFirstAssignedRuleFilter(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorId: string;
}): Promise<FilterState | undefined> {
  const assignment =
    await params.prisma.evaluationRuleEvaluatorAssignment.findFirst({
      where: {
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
        evaluator: { projectId: params.projectId },
        evaluationRule: { projectId: params.projectId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        evaluationRule: { select: { filter: true } },
      },
    });

  if (!assignment) return undefined;

  const validation = validateEvaluatorFiltersForTarget({
    targetObject: EvalTargetObject.EVENT,
    filter: assignment.evaluationRule.filter,
  });
  const usesCanonicalEventColumns = validation.validatedFilters.every(
    (filter) => eventEvaluatorFilterColumnIds.has(filter.column),
  );
  return validation.isValid && usesCanonicalEventColumns
    ? validation.validatedFilters
    : undefined;
}

export function findEvaluatorsByIds(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorIds: string[];
}) {
  return params.prisma.evaluator.findMany({
    where: {
      id: { in: params.evaluatorIds },
      projectId: params.projectId,
    },
    include: {
      versions: latestVersion,
    },
  });
}

export async function listEvaluatorVersions(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorId: string;
  cursor?: number;
  limit: number;
}) {
  const versions = await params.prisma.evaluatorVersion.findMany({
    where: {
      evaluatorId: params.evaluatorId,
      evaluator: { projectId: params.projectId },
      ...(params.cursor ? { version: { lt: params.cursor } } : {}),
    },
    orderBy: { version: "desc" },
    take: params.limit + 1,
    include: {
      createdByUser,
      evaluator: { select: { type: true } },
    },
  });
  const hasMore = versions.length > params.limit;
  const data = versions.slice(0, params.limit);

  return {
    data,
    nextCursor: hasMore ? data.at(-1)?.version : undefined,
  };
}

export function findEvaluatorsByName(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  name: string;
}) {
  return params.prisma.evaluator.findMany({
    where: { projectId: params.projectId, name: params.name },
    include: { versions: latestVersion },
    take: 2,
  });
}

export function createEvaluator(params: {
  prisma: PrismaClient | PrismaTransaction;
  input: Omit<CreateEvaluatorInput, "definition"> & {
    definition: EvaluatorDefinitionForPersistence;
  };
  createdByUserId: string | null;
  block?: { reason: EvaluatorBlockReason; message: string } | null;
}) {
  return params.prisma.evaluator.create({
    data: {
      id: params.input.evaluatorId,
      projectId: params.input.projectId,
      name: params.input.name,
      description: params.input.description,
      type: params.input.definition.type,
      createdByUserId: params.createdByUserId,
      ...(params.block
        ? {
            blockedAt: new Date(),
            blockReason: params.block.reason,
            blockMessage: params.block.message,
          }
        : {}),
      versions: {
        create: {
          version: 1,
          ...versionData(params.input.definition, params.createdByUserId),
        },
      },
    },
    include: {
      versions: latestVersionWithCreator,
      createdByUser,
      assignments: publicEvaluationRuleAssignments(params.input.projectId),
    },
  });
}

export function blockEvaluator(params: {
  tx: PrismaTransaction;
  projectId: string;
  evaluatorId: string;
  reason: EvaluatorBlockReason;
  message: string;
}) {
  return params.tx.evaluator.update({
    where: { id: params.evaluatorId, projectId: params.projectId },
    data: {
      blockedAt: new Date(),
      blockReason: params.reason,
      blockMessage: params.message,
    },
  });
}

export function unblockEvaluator(params: {
  tx: PrismaTransaction;
  projectId: string;
  evaluatorId: string;
}) {
  return params.tx.evaluator.update({
    where: { id: params.evaluatorId, projectId: params.projectId },
    data: {
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    },
  });
}

export function updateEvaluatorMetadata(params: {
  tx: PrismaTransaction;
  projectId: string;
  evaluatorId: string;
  name?: string;
  description?: string | null;
}) {
  return params.tx.evaluator.update({
    where: { id: params.evaluatorId, projectId: params.projectId },
    data: {
      ...(params.name === undefined ? {} : { name: params.name }),
      ...(params.description === undefined
        ? {}
        : { description: params.description }),
    },
  });
}

export async function appendEvaluatorVersion(params: {
  tx: PrismaTransaction;
  evaluatorId: string;
  version: number;
  definition: EvaluatorDefinitionForPersistence;
  createdByUserId: string | null;
}) {
  try {
    return await params.tx.evaluatorVersion.create({
      data: {
        evaluatorId: params.evaluatorId,
        version: params.version,
        ...versionData(params.definition, params.createdByUserId),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new EvaluatorVersionConflictError();
    }
    throw error;
  }
}

export async function deleteEvaluator(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  evaluatorId: string;
}) {
  const assignments =
    await params.prisma.evaluationRuleEvaluatorAssignment.findMany({
      where: {
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
      },
      select: { evaluationRuleId: true },
    });
  const result = await params.prisma.evaluator.deleteMany({
    where: { id: params.evaluatorId, projectId: params.projectId },
  });
  if (result.count > 0) {
    await setRuleStatus({
      prisma: params.prisma,
      projectId: params.projectId,
      ruleIds: assignments.map((assignment) => assignment.evaluationRuleId),
      enabled: false,
      unassignedOnly: true,
    });
  }
  return result.count > 0;
}
