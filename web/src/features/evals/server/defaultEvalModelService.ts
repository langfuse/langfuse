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
  const { actor, projectId, provider, model } = params;
  const modelParams = parseModelParams(params.modelParams);

  const before = await DefaultEvalModelService.fetchDefaultModel(projectId);
  const defaultModel = await DefaultEvalModelService.upsertDefaultModel({
    projectId,
    provider,
    model,
    modelParams,
  });
  await resumeEvaluatorsUsingDefaultModel(projectId);

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

  const { deleted, blockedEvaluatorIds } =
    await pauseEvaluatorsAndDeleteDefaultModel(projectId);
  await finalizeEvaluatorBlocks({
    projectId,
    source: EvaluatorBlockSource.DEFAULT_EVAL_MODEL_DELETION,
    evaluatorIdsByReason: {
      [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]: blockedEvaluatorIds,
    },
  });

  await auditLog({
    ...actor,
    resourceType: "defaultLlmModel",
    resourceId: deleted.id,
    action: "delete",
    before: deleted,
  });

  return { success: true };
}

function parseModelParams(modelParams: unknown) {
  const parsed = ZodModelConfig.safeParse(modelParams ?? {});
  if (!parsed.success) {
    throw new InvalidRequestError(
      `Invalid model params: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

async function resumeEvaluatorsUsingDefaultModel(projectId: string) {
  const { unblockedEvaluatorCount } = await prisma.$transaction((tx) =>
    unblockEvaluatorsUsingDefaultModel({ tx, projectId }),
  );

  if (unblockedEvaluatorCount > 0) {
    await invalidateProjectEvalConfigCaches(projectId);
  }
}

async function pauseEvaluatorsAndDeleteDefaultModel(projectId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { blockedEvaluatorIds } = await blockEvaluatorsUsingDefaultModel({
        tx,
        projectId,
      });
      const deleted = await tx.defaultLlmModel.delete({
        // unique constraint on projectId
        where: { projectId },
      });

      return { blockedEvaluatorIds, deleted };
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      throw new LangfuseNotFoundError("Default evaluation model not found");
    }
    throw error;
  }
}
