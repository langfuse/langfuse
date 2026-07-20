import { z } from "zod";

import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  InvalidRequestError,
  JobConfigState,
  LangfuseNotFoundError,
  singleFilter,
} from "@langfuse/shared";

export const EvaluatorActivationScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("setup") }),
  z.object({ mode: z.literal("existing"), runScopeId: z.string() }),
]);

export async function activateEvaluator({
  prisma,
  projectId,
  createdByUserId,
  evaluatorId,
  scope,
  now = new Date(),
}: {
  prisma: PrismaClient;
  projectId: string;
  createdByUserId: string;
  evaluatorId: string;
  scope: z.infer<typeof EvaluatorActivationScopeSchema>;
  now?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const evaluator = await tx.jobConfiguration.findFirst({
      where: { id: evaluatorId, projectId },
    });
    if (!evaluator) {
      throw new LangfuseNotFoundError("Evaluator not found");
    }

    if (evaluator.status === JobConfigState.ACTIVE) {
      throw new InvalidRequestError("Evaluator is already active");
    }

    const runScope =
      scope.mode === "existing"
        ? await tx.evalRunScope.findFirst({
            where: { id: scope.runScopeId, projectId },
          })
        : await tx.evalRunScope.create({
            data: {
              projectId,
              createdByUserId,
              name: `Evaluator scope ${now.toISOString()}`,
              targetObject: evaluator.targetObject,
              filter: z.array(singleFilter).parse(evaluator.filter),
              sampling: evaluator.sampling,
              delay: evaluator.delay,
            },
          });

    if (!runScope) {
      throw new LangfuseNotFoundError("Run scope not found");
    }
    if (runScope.targetObject !== evaluator.targetObject) {
      throw new InvalidRequestError(
        "The selected scope targets a different data type",
      );
    }
    const runScopeFilter = z.array(singleFilter).parse(runScope.filter);

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

    const updated = await tx.jobConfiguration.update({
      where: { id: evaluator.id, projectId },
      data: {
        targetObject: runScope.targetObject,
        filter: runScopeFilter,
        sampling: runScope.sampling,
        delay: runScope.delay,
        status: JobConfigState.ACTIVE,
        timeScope: ["NEW"],
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
      },
    });

    return { id: updated.id, runScopeId: runScope.id };
  });
}
