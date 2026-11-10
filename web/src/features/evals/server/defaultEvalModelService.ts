import { type z } from "zod";
import {
  EvaluatorBlockReason,
  InvalidRequestError,
  LangfuseNotFoundError,
  ZodModelConfig,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  blockEvaluatorsUsingDefaultModel,
  DefaultEvalModelService,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
  invalidateProjectEvalConfigCaches,
  isPrismaRecordNotFoundError,
  unblockEvaluatorsUsingDefaultModel,
} from "@langfuse/shared/src/server";
import {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";

/**
 * Validates the model with a test call, saves it as the project's default
 * evaluation model and resumes evaluators paused for a missing default model.
 * Omitted model params clear the stored ones, so the saved config is always
 * the one that was tested.
 */
export async function upsertDefaultEvalModel(params: {
  projectId: string;
  provider: string;
  model: string;
  modelParams?: z.infer<typeof ZodModelConfig>;
  actor: AuditLogActor;
}) {
  const { actor, modelParams, ...rest } = params;
  const parsedModelParams = ZodModelConfig.safeParse(modelParams ?? {});
  if (!parsedModelParams.success) {
    throw new InvalidRequestError(
      `Invalid model params: ${parsedModelParams.error.message}`,
    );
  }
  const input = { ...rest, modelParams: parsedModelParams.data };
  const before = await DefaultEvalModelService.fetchDefaultModel(
    input.projectId,
  );

  const defaultModel = await DefaultEvalModelService.upsertDefaultModel(input);
  const unblocked = await prisma.$transaction((tx) =>
    unblockEvaluatorsUsingDefaultModel({
      tx,
      projectId: input.projectId,
    }),
  );

  if (unblocked.unblockedEvaluatorCount > 0) {
    await invalidateProjectEvalConfigCaches(input.projectId);
  }

  await auditLog({
    ...actor,
    resourceType: "defaultLlmModel",
    resourceId: defaultModel.id,
    action: before ? "update" : "create",
    before: before ?? undefined,
    after: defaultModel,
  });

  return defaultModel;
}

/**
 * Removes the project's default evaluation model and pauses every evaluator
 * that relied on it.
 */
export async function deleteDefaultEvalModel(params: {
  projectId: string;
  actor: AuditLogActor;
}): Promise<{ success: true }> {
  const { projectId, actor } = params;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const blockResult = await blockEvaluatorsUsingDefaultModel({
        tx,
        projectId,
      });

      const deleted = await tx.defaultLlmModel.delete({
        // unique constraint on projectId
        where: { projectId },
      });

      return { ...blockResult, deleted };
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      throw new LangfuseNotFoundError("Default evaluation model not found");
    }
    throw error;
  }

  await finalizeEvaluatorBlocks({
    projectId,
    source: EvaluatorBlockSource.DEFAULT_EVAL_MODEL_DELETION,
    evaluatorIdsByReason: {
      [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
        result.blockedEvaluatorIds,
    },
  });

  await auditLog({
    ...actor,
    resourceType: "defaultLlmModel",
    resourceId: result.deleted.id,
    action: "delete",
    before: result.deleted,
  });

  return { success: true };
}
