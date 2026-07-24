import { z } from "zod";

import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  InvalidRequestError,
  JobConfigState,
  LangfuseNotFoundError,
  singleFilter,
} from "@langfuse/shared";

export const EvaluatorActivationRuleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("setup") }),
  z.object({ mode: z.literal("existing"), ruleId: z.string() }),
]);

export async function activateEvaluator({
  prisma,
  projectId,
  createdByUserId,
  evaluatorId,
  rule,
  now = new Date(),
}: {
  prisma: PrismaClient;
  projectId: string;
  createdByUserId: string;
  evaluatorId: string;
  rule: z.infer<typeof EvaluatorActivationRuleSchema>;
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

    const evaluationRule =
      rule.mode === "existing"
        ? await tx.evalRunScope.findFirst({
            where: { id: rule.ruleId, projectId },
          })
        : await tx.evalRunScope.create({
            data: {
              projectId,
              createdByUserId,
              name: `Evaluator rule ${now.toISOString()}`,
              targetObject: evaluator.targetObject,
              filter: z.array(singleFilter).parse(evaluator.filter),
              sampling: evaluator.sampling,
              delay: evaluator.delay,
            },
          });

    if (!evaluationRule) {
      throw new LangfuseNotFoundError("Evaluation rule not found");
    }
    if (evaluationRule.targetObject !== evaluator.targetObject) {
      throw new InvalidRequestError(
        "The selected rule uses a different data type",
      );
    }
    const evaluationRuleFilter = z
      .array(singleFilter)
      .parse(evaluationRule.filter);

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

    const updated = await tx.jobConfiguration.update({
      where: { id: evaluator.id, projectId },
      data: {
        targetObject: evaluationRule.targetObject,
        filter: evaluationRuleFilter,
        sampling: evaluationRule.sampling,
        delay: evaluationRule.delay,
        status: JobConfigState.ACTIVE,
        timeScope: ["NEW"],
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
      },
    });

    return { id: updated.id, ruleId: evaluationRule.id };
  });
}
