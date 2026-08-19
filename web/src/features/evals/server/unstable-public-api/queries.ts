import { EvalTargetObject, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type {
  EvaluationRuleEvaluatorFamilyReference,
  PrismaClientLike,
  StoredPublicV2EvaluationRule,
} from "./types";
import { toStoredEvaluatorType } from "./adapters";

function getPrismaClient(client?: PrismaClientLike) {
  return client ?? prisma;
}

const publicV2RuleInclude = (projectId: string) => ({
  assignments: {
    where: { projectId, evaluator: { projectId } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      evaluator: {
        include: {
          versions: { orderBy: { version: "desc" as const }, take: 1 },
        },
      },
    },
  },
});

export async function findPublicV2EvaluationRule(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluationRuleId: string;
}) {
  const client = getPrismaClient(params.client);
  return client.evaluationRule.findFirst({
    where: { id: params.evaluationRuleId, projectId: params.projectId },
    include: publicV2RuleInclude(params.projectId),
  }) as Promise<StoredPublicV2EvaluationRule | null>;
}

export async function findPublicV2EvaluatorInFamily(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluator: EvaluationRuleEvaluatorFamilyReference;
}) {
  const client = getPrismaClient(params.client);
  const evaluator = await client.evaluator.findFirst({
    where: {
      projectId: params.projectId,
      name: params.evaluator.name,
      type: toStoredEvaluatorType(params.evaluator.type),
    },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  return evaluator?.versions.length ? evaluator : null;
}

export async function findPublicV2EvaluatorById(params: {
  client?: PrismaClientLike;
  projectId: string;
  evaluatorId: string;
}) {
  const client = getPrismaClient(params.client);
  const evaluator = await client.evaluator.findFirst({
    where: { id: params.evaluatorId, projectId: params.projectId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  return evaluator?.versions.length ? evaluator : null;
}

export async function findPublicV2EvaluatorByIdOrThrow(
  params: Parameters<typeof findPublicV2EvaluatorById>[0],
) {
  const evaluator = await findPublicV2EvaluatorById(params);
  if (!evaluator) {
    throw new LangfuseNotFoundError(
      "Latest evaluator version not found within authorized project",
    );
  }
  return evaluator;
}

export async function findPublicV2EvaluatorInFamilyOrThrow(
  params: Parameters<typeof findPublicV2EvaluatorInFamily>[0],
) {
  const evaluator = await findPublicV2EvaluatorInFamily(params);
  if (!evaluator) {
    throw new LangfuseNotFoundError(
      "Latest evaluator version not found within authorized project",
    );
  }
  return evaluator;
}

export async function listPublicEvaluationRulePage(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const where = {
    projectId: params.projectId,
    targetObject: {
      in: [
        EvalTargetObject.EVENT,
        EvalTargetObject.EXPERIMENT,
        EvalTargetObject.TRACE,
        EvalTargetObject.DATASET,
      ],
    },
  };
  const [records, totalItems] = await Promise.all([
    prisma.evaluationRule.findMany({
      where,
      include: publicV2RuleInclude(params.projectId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit,
      skip: (params.page - 1) * params.limit,
    }),
    prisma.evaluationRule.count({ where }),
  ]);

  return {
    records: records as StoredPublicV2EvaluationRule[],
    totalItems,
  };
}
