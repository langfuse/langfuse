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

export async function createRunScope({
  prisma,
  projectId,
  name,
  targetObject,
  filter,
  sampling,
  evaluatorId,
}: {
  prisma: PrismaClient;
  projectId: string;
  name: string;
  targetObject: string;
  filter: z.infer<typeof singleFilter>[];
  sampling: number;
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
          "The evaluator and run scope target different data types",
        );
      }

      const runScope = await tx.evalRunScope.create({
        data: {
          projectId,
          name: name.trim(),
          targetObject,
          filter,
          sampling,
        },
      });

      if (evaluator) {
        await tx.evalRunScopeAssignment.create({
          data: {
            jobConfigurationId: evaluator.id,
            runScopeId: runScope.id,
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

      return runScope;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError(
        `A run scope named "${name.trim()}" already exists.`,
      );
    }
    throw error;
  }
}

export async function deleteRunScope({
  prisma,
  projectId,
  runScopeId,
}: {
  prisma: PrismaClient;
  projectId: string;
  runScopeId: string;
}) {
  const [id] = await deleteRunScopes({
    prisma,
    projectId,
    runScopeIds: [runScopeId],
  });

  return { id };
}

export async function deleteRunScopes({
  prisma,
  projectId,
  runScopeIds,
}: {
  prisma: PrismaClient;
  projectId: string;
  runScopeIds: string[];
}) {
  const uniqueRunScopeIds = [...new Set(runScopeIds)];

  return prisma.$transaction(async (tx) => {
    const scopes = await tx.evalRunScope.findMany({
      where: { id: { in: uniqueRunScopeIds }, projectId },
      select: {
        id: true,
        evaluatorAssignments: {
          select: { jobConfigurationId: true },
        },
      },
    });
    if (scopes.length !== uniqueRunScopeIds.length) {
      throw new LangfuseNotFoundError(
        uniqueRunScopeIds.length === 1
          ? "Run scope not found"
          : "One or more run scopes were not found",
      );
    }

    await tx.evalRunScope.deleteMany({
      where: { id: { in: uniqueRunScopeIds }, projectId },
    });

    const evaluatorIds = [
      ...new Set(
        scopes.flatMap((scope) =>
          scope.evaluatorAssignments.map(
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

    return uniqueRunScopeIds;
  });
}

export async function setRunScopesEnabled({
  prisma,
  projectId,
  runScopeIds,
  enabled,
}: {
  prisma: PrismaClient;
  projectId: string;
  runScopeIds: string[];
  enabled: boolean;
}) {
  const uniqueRunScopeIds = [...new Set(runScopeIds)];

  return prisma.$transaction(async (tx) => {
    const matchingScopeCount = await tx.evalRunScope.count({
      where: { id: { in: uniqueRunScopeIds }, projectId },
    });
    if (matchingScopeCount !== uniqueRunScopeIds.length) {
      throw new LangfuseNotFoundError("One or more run scopes were not found");
    }

    await tx.evalRunScope.updateMany({
      where: { id: { in: uniqueRunScopeIds }, projectId },
      data: { enabled },
    });

    return uniqueRunScopeIds;
  });
}

export async function attachEvaluatorToRunScope({
  prisma,
  projectId,
  evaluatorId,
  runScopeId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorId: string;
  runScopeId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [evaluator, runScope] = await Promise.all([
      tx.jobConfiguration.findFirst({
        where: { id: evaluatorId, projectId },
      }),
      tx.evalRunScope.findFirst({
        where: { id: runScopeId, projectId },
      }),
    ]);

    if (!evaluator) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    if (!runScope) {
      throw new LangfuseNotFoundError("Run scope not found");
    }
    if (evaluator.targetObject !== runScope.targetObject) {
      throw new InvalidRequestError(
        "The evaluator and run scope target different data types",
      );
    }

    await tx.evalRunScopeAssignment.upsert({
      where: {
        jobConfigurationId_runScopeId: {
          jobConfigurationId: evaluator.id,
          runScopeId: runScope.id,
        },
      },
      create: {
        jobConfigurationId: evaluator.id,
        runScopeId: runScope.id,
      },
      update: {},
    });

    // The worker reads all assignments. The legacy targeting columns retain a
    // valid scope-shaped fallback for rolling deploys and older workers.
    await tx.jobConfiguration.update({
      where: { id: evaluator.id, projectId },
      data: {
        targetObject: runScope.targetObject,
        filter: z.array(singleFilter).parse(runScope.filter),
        sampling: runScope.sampling,
        delay: runScope.delay,
        status: JobConfigState.ACTIVE,
        timeScope: ["NEW"],
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
      },
    });

    return { evaluatorId: evaluator.id, runScopeId: runScope.id };
  });
}

export async function detachEvaluatorFromRunScope({
  prisma,
  projectId,
  evaluatorId,
  runScopeId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evaluatorId: string;
  runScopeId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const evaluator = await tx.jobConfiguration.findFirst({
      where: { id: evaluatorId, projectId },
      select: { id: true },
    });
    const runScope = await tx.evalRunScope.findFirst({
      where: { id: runScopeId, projectId },
      select: { id: true },
    });
    if (!evaluator) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }
    if (!runScope) {
      throw new LangfuseNotFoundError("Run scope not found");
    }

    await tx.evalRunScopeAssignment.deleteMany({
      where: {
        jobConfigurationId: evaluator.id,
        runScopeId: runScope.id,
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

    return { evaluatorId: evaluator.id, runScopeId: runScope.id };
  });
}
