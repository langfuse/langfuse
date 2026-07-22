import { z } from "zod";

import {
  InvalidRequestError,
  JobConfigState,
  LangfuseConflictError,
  LangfuseNotFoundError,
  Prisma,
  singleFilter,
} from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";

export async function createRule({
  prisma,
  projectId,
  createdByUserId,
  name,
  targetObject,
  filter,
  sampling,
  enabled,
  evaluatorId,
}: {
  prisma: PrismaClient;
  projectId: string;
  createdByUserId: string;
  name: string;
  targetObject: string;
  filter: z.infer<typeof singleFilter>[];
  sampling: number;
  enabled: boolean;
  evaluatorId?: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const evaluator = evaluatorId
        ? await tx.jobConfiguration.findFirst({
            where: { id: evaluatorId, projectId },
          })
        : null;
      if (evaluatorId && !evaluator) {
        throw new LangfuseNotFoundError("Evaluator not found");
      }
      if (evaluator && evaluator.targetObject !== targetObject) {
        throw new InvalidRequestError(
          "The evaluator and evaluation rule use different data types",
        );
      }

      const evaluationRule = await tx.evalRunScope.create({
        data: {
          projectId,
          createdByUserId,
          name: name.trim(),
          targetObject,
          filter,
          sampling,
          enabled,
        },
      });

      if (evaluator) {
        await tx.evalRunScopeAssignment.create({
          data: {
            jobConfigurationId: evaluator.id,
            runScopeId: evaluationRule.id,
          },
        });
        await tx.jobConfiguration.update({
          where: { id: evaluator.id, projectId },
          data: {
            filter,
            sampling,
            status: JobConfigState.ACTIVE,
            timeScope: ["NEW"],
            blockedAt: null,
            blockReason: null,
            blockMessage: null,
          },
        });
      }

      return evaluationRule;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError(
        `An evaluation rule named "${name.trim()}" already exists.`,
      );
    }
    throw error;
  }
}

export async function deleteRule({
  prisma,
  projectId,
  ruleId,
}: {
  prisma: PrismaClient;
  projectId: string;
  ruleId: string;
}) {
  const [id] = await deleteRules({
    prisma,
    projectId,
    ruleIds: [ruleId],
  });

  return { id };
}

export async function deleteRules({
  prisma,
  projectId,
  ruleIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  ruleIds: string[];
}) {
  const uniqueEvaluationRuleIds = [...new Set(ruleIds)];

  return prisma.$transaction(async (tx) => {
    const rules = await tx.evalRunScope.findMany({
      where: { id: { in: uniqueEvaluationRuleIds }, projectId },
      select: {
        id: true,
        evaluatorAssignments: {
          select: { jobConfigurationId: true },
        },
      },
    });
    if (rules.length !== uniqueEvaluationRuleIds.length) {
      throw new LangfuseNotFoundError(
        uniqueEvaluationRuleIds.length === 1
          ? "Evaluation rule not found"
          : "One or more evaluation rules were not found",
      );
    }

    await tx.evalRunScope.deleteMany({
      where: { id: { in: uniqueEvaluationRuleIds }, projectId },
    });

    const evaluatorIds = [
      ...new Set(
        rules.flatMap((rule) =>
          rule.evaluatorAssignments.map(
            (assignment) => assignment.jobConfigurationId,
          ),
        ),
      ),
    ];
    if (evaluatorIds.length > 0) {
      await tx.jobConfiguration.updateMany({
        where: {
          id: { in: evaluatorIds },
          projectId,
          runScopeAssignments: { none: {} },
        },
        data: { status: JobConfigState.INACTIVE },
      });
    }

    return uniqueEvaluationRuleIds;
  });
}

export async function setRulesEnabled({
  prisma,
  projectId,
  ruleIds,
  enabled,
}: {
  prisma: PrismaClient;
  projectId: string;
  ruleIds: string[];
  enabled: boolean;
}) {
  const uniqueEvaluationRuleIds = [...new Set(ruleIds)];

  return prisma.$transaction(async (tx) => {
    const matchingRuleCount = await tx.evalRunScope.count({
      where: { id: { in: uniqueEvaluationRuleIds }, projectId },
    });
    if (matchingRuleCount !== uniqueEvaluationRuleIds.length) {
      throw new LangfuseNotFoundError(
        "One or more evaluation rules were not found",
      );
    }

    await tx.evalRunScope.updateMany({
      where: { id: { in: uniqueEvaluationRuleIds }, projectId },
      data: { enabled },
    });

    return uniqueEvaluationRuleIds;
  });
}

export async function attachEvaluatorToRule({
  prisma,
  projectId,
  evaluatorId,
  ruleId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorId: string;
  ruleId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [evaluator, evaluationRule] = await Promise.all([
      tx.jobConfiguration.findFirst({
        where: { id: evaluatorId, projectId },
      }),
      tx.evalRunScope.findFirst({
        where: { id: ruleId, projectId },
      }),
    ]);

    if (!evaluator) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    if (!evaluationRule) {
      throw new LangfuseNotFoundError("Evaluation rule not found");
    }
    if (evaluator.targetObject !== evaluationRule.targetObject) {
      throw new InvalidRequestError(
        "The evaluator and evaluation rule use different data types",
      );
    }

    await tx.evalRunScopeAssignment.upsert({
      where: {
        jobConfigurationId_runScopeId: {
          jobConfigurationId: evaluator.id,
          runScopeId: evaluationRule.id,
        },
      },
      create: {
        jobConfigurationId: evaluator.id,
        runScopeId: evaluationRule.id,
      },
      update: {},
    });

    // The worker reads all assignments. The legacy targeting columns retain a
    // valid rule-shaped fallback for rolling deploys and older workers.
    await tx.jobConfiguration.update({
      where: { id: evaluator.id, projectId },
      data: {
        targetObject: evaluationRule.targetObject,
        filter: z.array(singleFilter).parse(evaluationRule.filter),
        sampling: evaluationRule.sampling,
        delay: evaluationRule.delay,
        status: JobConfigState.ACTIVE,
        timeScope: ["NEW"],
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
      },
    });

    return { evaluatorId: evaluator.id, ruleId: evaluationRule.id };
  });
}

export async function detachEvaluatorFromRule({
  prisma,
  projectId,
  evaluatorId,
  ruleId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorId: string;
  ruleId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const evaluator = await tx.jobConfiguration.findFirst({
      where: { id: evaluatorId, projectId },
      select: { id: true },
    });
    const evaluationRule = await tx.evalRunScope.findFirst({
      where: { id: ruleId, projectId },
      select: { id: true },
    });
    if (!evaluator) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    if (!evaluationRule) {
      throw new LangfuseNotFoundError("Evaluation rule not found");
    }

    await tx.evalRunScopeAssignment.deleteMany({
      where: {
        jobConfigurationId: evaluator.id,
        runScopeId: evaluationRule.id,
      },
    });

    const remainingAssignments = await tx.evalRunScopeAssignment.count({
      where: { jobConfigurationId: evaluator.id },
    });
    if (remainingAssignments === 0) {
      await tx.jobConfiguration.update({
        where: { id: evaluator.id, projectId },
        data: { status: JobConfigState.INACTIVE },
      });
    }

    return { evaluatorId: evaluator.id, ruleId: evaluationRule.id };
  });
}
