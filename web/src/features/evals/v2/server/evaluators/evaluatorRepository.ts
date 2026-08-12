import {
  EvalTemplateType,
  Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import type {
  CreateEvaluatorInput,
  EvaluatorDefinition,
} from "./evaluatorTypes";
import { EvaluatorVersionConflictError } from "./evaluatorErrors";
import { setRuleStatus } from "../rules/ruleRepository";

type PrismaTransaction = Prisma.TransactionClient;

const latestVersion = {
  orderBy: { version: "desc" as const },
  take: 1,
};

function versionData(
  definition: EvaluatorDefinition,
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

export async function listEvaluators(params: {
  prisma: PrismaClient;
  projectId: string;
  page: number;
  limit: number;
  search?: string;
}) {
  const where = {
    projectId: params.projectId,
    ...(params.search
      ? { name: { contains: params.search, mode: "insensitive" as const } }
      : {}),
  };
  const [evaluators, totalItems] = await Promise.all([
    params.prisma.evaluator.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: {
        versions: latestVersion,
        createdByUser: { select: { name: true, email: true } },
        _count: {
          select: {
            assignments: { where: { projectId: params.projectId } },
          },
        },
        assignments: {
          where: { projectId: params.projectId },
          select: {
            evaluationRule: { select: { status: true } },
          },
        },
      },
    }),
    params.prisma.evaluator.count({ where }),
  ]);
  return {
    evaluators: evaluators.map(({ assignments, ...evaluator }) => ({
      ...evaluator,
      hasActiveRules: assignments.some(
        ({ evaluationRule }) => evaluationRule.status === "ACTIVE",
      ),
    })),
    totalItems,
  };
}

export async function listEvaluatorIds(params: {
  prisma: PrismaClient | PrismaTransaction;
  projectId: string;
  search?: string;
}) {
  const evaluators = await params.prisma.evaluator.findMany({
    where: {
      projectId: params.projectId,
      ...(params.search
        ? { name: { contains: params.search, mode: "insensitive" as const } }
        : {}),
    },
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
}) {
  const evaluators = await params.prisma.evaluator.findMany({
    where: {
      projectId: params.projectId,
      ...(params.search
        ? { name: { contains: params.search, mode: "insensitive" } }
        : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: params.limit,
    select: {
      id: true,
      name: true,
      type: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true, variableMapping: true },
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
      versions: latestVersion,
    },
  });
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
  input: CreateEvaluatorInput;
  createdByUserId: string | null;
}) {
  return params.prisma.evaluator.create({
    data: {
      id: params.input.evaluatorId,
      projectId: params.input.projectId,
      name: params.input.name,
      description: params.input.description,
      type: params.input.definition.type,
      createdByUserId: params.createdByUserId,
      versions: {
        create: {
          version: 1,
          ...versionData(params.input.definition, params.createdByUserId),
        },
      },
    },
    include: { versions: latestVersion },
  });
}

export function updateEvaluatorMetadata(params: {
  tx: PrismaTransaction;
  projectId: string;
  evaluatorId: string;
  name: string;
  description: string | null;
}) {
  return params.tx.evaluator.update({
    where: { id: params.evaluatorId, projectId: params.projectId },
    data: { name: params.name, description: params.description },
  });
}

export async function appendEvaluatorVersion(params: {
  tx: PrismaTransaction;
  evaluatorId: string;
  version: number;
  definition: EvaluatorDefinition;
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
  const result = await params.prisma.evaluator.deleteMany({
    where: { id: params.evaluatorId, projectId: params.projectId },
  });
  if (result.count > 0) {
    await setRuleStatus({
      prisma: params.prisma,
      projectId: params.projectId,
      enabled: false,
      unassignedOnly: true,
    });
  }
  return result.count > 0;
}
