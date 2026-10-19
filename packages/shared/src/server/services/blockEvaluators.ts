import { EvalTemplateType, EvaluatorBlockReason, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { env } from "../../env";
import {
  getEvaluatorBlockMetadata,
  getEvaluatorBlockResolutionPath,
} from "../../features/evals/evalConfigBlocking";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";
import { recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import { dispatchProjectNotification } from "../notifications/dispatchProjectNotification";

export const EvaluatorBlockSource = {
  DEFAULT_EVAL_MODEL_DELETION: "default_eval_model_deletion",
  INVALID_MODEL_CONFIG: "invalid_model_config",
  LLM_API_KEY_DELETION: "llm_api_key_deletion",
  LLM_COMPLETION_ERROR: "llm_completion_error",
} as const;

export type EvaluatorBlockSource =
  (typeof EvaluatorBlockSource)[keyof typeof EvaluatorBlockSource];

export type BlockedEvaluatorConfigIdsByReason = {
  [reason in EvaluatorBlockReason]?: string[];
};

type BlockedEvaluatorConfigNotification = {
  blockReason: EvaluatorBlockReason;
  blockedIds: string[];
};

/** Claims evaluators that are still runnable, so only the first claimer notifies. */
export async function blockEvaluatorsInTx({
  tx,
  projectId,
  evaluatorIds,
  blockReason,
  blockMessage,
  blockedAt = new Date(),
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  evaluatorIds: string[];
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  blockedAt?: Date;
}): Promise<{ blockedEvaluatorIds: string[] }> {
  if (evaluatorIds.length === 0) {
    return { blockedEvaluatorIds: [] };
  }

  const claimable = await tx.evaluator.findMany({
    where: { id: { in: evaluatorIds }, projectId, blockedAt: null },
    select: { id: true },
  });
  const blockedEvaluatorIds = claimable.map((evaluator) => evaluator.id);

  if (blockedEvaluatorIds.length === 0) {
    return { blockedEvaluatorIds: [] };
  }

  await tx.evaluator.updateMany({
    where: { projectId, blockedAt: null, id: { in: blockedEvaluatorIds } },
    data: { blockedAt, blockReason, blockMessage },
  });

  // Queued executions are cancelled when workers re-check executability on pickup.
  return { blockedEvaluatorIds };
}

export type EvaluatorBlockResult = {
  blockedEvaluatorIds: string[];
};

export const EMPTY_EVALUATOR_BLOCK: EvaluatorBlockResult = {
  blockedEvaluatorIds: [],
};

/**
 * Applies one block reason to evaluator v2 rows.
 */
async function blockForReasonInTx(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
  evaluatorIds: string[];
  blockReason: EvaluatorBlockReason;
  blockedAt?: Date;
}): Promise<EvaluatorBlockResult> {
  const { tx, projectId, evaluatorIds, blockReason, blockedAt } = params;
  const blockMessage = getEvaluatorBlockMetadata(blockReason).message;
  const { blockedEvaluatorIds } = await blockEvaluatorsInTx({
    tx,
    projectId,
    evaluatorIds,
    blockReason,
    blockMessage,
    blockedAt,
  });

  return { blockedEvaluatorIds };
}

/**
 * Only the *current* evaluator
 * version matters, because that is what a rule executes — older versions are
 * history. Prisma cannot express "the latest related row matches", so the
 * candidates are narrowed in SQL and the head version is compared here; the
 * set is bounded by the project's evaluator count, and this only runs when a
 * connection or the default eval model is deleted.
 */
async function findEvaluatorIdsWithCurrentVersion(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
  matches: (version: {
    provider: string | null;
    model: string | null;
  }) => boolean;
}): Promise<string[]> {
  const evaluators = await params.tx.evaluator.findMany({
    where: {
      projectId: params.projectId,
      type: EvalTemplateType.LLM_AS_JUDGE,
      blockedAt: null,
    },
    select: {
      id: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { provider: true, model: true },
      },
    },
  });

  return evaluators.flatMap((evaluator) => {
    const version = evaluator.versions[0];
    return version && params.matches(version) ? [evaluator.id] : [];
  });
}

/**
 * Pauses every evaluator that would run on a deleted LLM connection.
 */
export async function blockEvaluatorsUsingProvider(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
  provider: string;
}): Promise<EvaluatorBlockResult> {
  const { tx, projectId, provider } = params;
  const evaluatorIds = await findEvaluatorIdsWithCurrentVersion({
    tx,
    projectId,
    matches: (version) => version.provider === provider,
  });

  return blockForReasonInTx({
    tx,
    projectId,
    evaluatorIds,
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_MISSING,
  });
}

/**
 * Pauses every evaluator that falls back to the project's default eval model,
 * for when that model (or the connection behind it) is deleted.
 */
export async function blockEvaluatorsUsingDefaultModel(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
}): Promise<EvaluatorBlockResult> {
  const { tx, projectId } = params;
  const evaluatorIds = await findEvaluatorIdsWithCurrentVersion({
    tx,
    projectId,
    matches: (version) => version.provider === null && version.model === null,
  });

  return blockForReasonInTx({
    tx,
    projectId,
    evaluatorIds,
    blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
  });
}

/**
 * Resumes evaluators that were paused specifically because the project had no
 * default model. Other block reasons still require their own resolution.
 */
export async function unblockEvaluatorsUsingDefaultModel(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
}): Promise<{
  unblockedEvaluatorCount: number;
}> {
  const where = {
    projectId: params.projectId,
    blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
  };
  const data = {
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
  };
  const evaluators = await params.tx.evaluator.updateMany({ where, data });

  return {
    unblockedEvaluatorCount: evaluators.count,
  };
}

/** Pauses one evaluator and runs the notification tail. */
export async function blockEvaluator(params: {
  projectId: string;
  evaluatorId: string;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  source: EvaluatorBlockSource;
  blockedAt?: Date;
}): Promise<{ blockedEvaluatorIds: string[] }> {
  // The `blockedAt: null` claim dedupes concurrent executions of the same
  // evaluator, so only the first one notifies.
  const { count } = await prisma.evaluator.updateMany({
    where: {
      id: params.evaluatorId,
      projectId: params.projectId,
      blockedAt: null,
    },
    data: {
      blockedAt: params.blockedAt ?? new Date(),
      blockReason: params.blockReason,
      blockMessage: params.blockMessage,
    },
  });

  if (count === 0) {
    return { blockedEvaluatorIds: [] };
  }

  await finalizeEvaluatorBlocks({
    projectId: params.projectId,
    source: params.source,
    evaluatorIdsByReason: { [params.blockReason]: [params.evaluatorId] },
  });

  // Queued executions are cancelled when workers re-check executability on pickup.
  return { blockedEvaluatorIds: [params.evaluatorId] };
}

/** Runs cache invalidation, metrics, logging and notifications after blocking. */
export async function finalizeEvaluatorBlocks(params: {
  projectId: string;
  source: EvaluatorBlockSource;
  evaluatorIdsByReason?: BlockedEvaluatorConfigIdsByReason;
}): Promise<void> {
  const notifications = getBlockedEvaluatorConfigNotifications(
    params.evaluatorIdsByReason ?? {},
  );
  if (notifications.length === 0) {
    return;
  }

  await invalidateProjectEvalConfigCaches(params.projectId);
  emitEvaluatorBlocks({
    ...params,
    notifications,
    notify: notifyBlockedEvaluators,
  });
}

function emitEvaluatorBlocks(params: {
  projectId: string;
  source: EvaluatorBlockSource;
  notifications: BlockedEvaluatorConfigNotification[];
  notify: (params: NotifyBlockedEvaluatorsParams) => Promise<void>;
}): void {
  for (const notification of params.notifications) {
    const blockedCount = notification.blockedIds.length;

    recordIncrement("langfuse.evals.blocked_total", blockedCount, {
      reason: notification.blockReason,
      source: params.source,
    });

    logger.info(
      `[EVALUATOR BLOCK] Blocked evaluator configs for project ${params.projectId}, reason: ${notification.blockReason}, source: ${params.source}, blocked_count: ${blockedCount}`,
    );

    params
      .notify({ projectId: params.projectId, ...notification })
      .catch((error) =>
        logger.error(
          "[EVALUATOR BLOCK] Failed to send blocked evaluator notifications",
          error,
        ),
      );
  }
}

const getBlockedEvaluatorConfigNotifications = (
  blockedByReason: BlockedEvaluatorConfigIdsByReason,
): BlockedEvaluatorConfigNotification[] =>
  Object.entries(blockedByReason).flatMap(([blockReason, blockedIds]) =>
    blockedIds?.length
      ? [
          {
            blockReason: blockReason as EvaluatorBlockReason,
            blockedIds,
          },
        ]
      : [],
  );

type NotifyBlockedEvaluatorsParams = {
  projectId: string;
  blockedIds: string[];
  blockReason: EvaluatorBlockReason;
};

export async function notifyBlockedEvaluators({
  projectId,
  blockedIds: blockedEvaluatorIds,
  blockReason,
}: NotifyBlockedEvaluatorsParams): Promise<void> {
  if (blockedEvaluatorIds.length === 0) {
    return;
  }

  const blockMessage = getEvaluatorBlockMetadata(blockReason).message;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });

  if (!project) {
    logger.warn(
      `[EVALUATOR BLOCK] Project ${projectId} not found. Skipping notifications.`,
    );
    return;
  }

  const blockedEvaluators = await prisma.evaluator.findMany({
    where: { projectId, id: { in: blockedEvaluatorIds } },
    select: { id: true, name: true },
  });

  if (blockedEvaluators.length === 0) {
    return;
  }

  await Promise.allSettled(
    blockedEvaluators.map((evaluator) => {
      const resolutionPath = getEvaluatorBlockResolutionPath({
        projectId,
        blockReason,
        evaluatorId: evaluator.id,
      });
      return dispatchProjectNotification({
        projectId,
        event: {
          eventType: "evaluator-blocked",
          severity: "ALERT",
          projectId,
          resourceId: evaluator.id,
          resourceName: evaluator.name,
          message: blockMessage,
          url: env.NEXTAUTH_URL
            ? `${env.NEXTAUTH_URL}${resolutionPath}`
            : undefined,
          projectName: project.name,
          blockReason,
          evaluatorId: evaluator.id,
        },
      });
    }),
  );
}
