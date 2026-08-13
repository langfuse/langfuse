import {
  EvalTemplateType,
  EvaluatorBlockReason,
  JobConfigState,
  Prisma,
} from "@prisma/client";
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

type BlockEvaluatorConfigsBaseParams = {
  projectId: string;
  where: Prisma.JobConfigurationWhereInput;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  blockedAt?: Date;
};

type BlockEvaluatorConfigsParams = BlockEvaluatorConfigsBaseParams & {
  source: EvaluatorBlockSource;
};

type BlockEvaluatorConfigsInTxParams = BlockEvaluatorConfigsBaseParams & {
  tx: Prisma.TransactionClient;
};

export type BlockedEvaluatorConfigIdsByReason = {
  [reason in EvaluatorBlockReason]?: string[];
};

type BlockedEvaluatorConfigNotification = {
  blockReason: EvaluatorBlockReason;
  blockedIds: string[];
};

export async function blockEvaluatorConfigsInTx({
  tx,
  projectId,
  where,
  blockReason,
  blockMessage,
  blockedAt = new Date(),
}: BlockEvaluatorConfigsInTxParams): Promise<{
  blockedJobConfigIds: string[];
}> {
  // Preserve the previous "no explicit scope means no-op" behavior.
  if (Object.keys(where).length === 0) {
    return { blockedJobConfigIds: [] };
  }

  const activeEvaluatorConfigs = await tx.jobConfiguration.findMany({
    where: {
      AND: [
        where,
        {
          projectId,
          status: JobConfigState.ACTIVE,
          blockedAt: null,
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const blockedJobConfigIds = activeEvaluatorConfigs.map((config) => config.id);

  if (blockedJobConfigIds.length === 0) {
    return { blockedJobConfigIds: [] };
  }

  await tx.jobConfiguration.updateMany({
    where: {
      projectId,
      status: JobConfigState.ACTIVE,
      blockedAt: null,
      id: {
        in: blockedJobConfigIds,
      },
    },
    data: {
      blockedAt,
      blockReason,
      blockMessage,
    },
  });

  // Queued executions are cancelled when workers re-check executability on pickup.
  return { blockedJobConfigIds };
}

/**
 * Evaluator v2 counterpart of {@link blockEvaluatorConfigsInTx}: claims the
 * evaluators that are still runnable, so only the first claimer notifies.
 */
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
  blockedJobConfigIds: string[];
  blockedEvaluatorIds: string[];
};

export const EMPTY_EVALUATOR_BLOCK: EvaluatorBlockResult = {
  blockedJobConfigIds: [],
  blockedEvaluatorIds: [],
};

/**
 * Applies one block reason to both data models with the same message and claim
 * semantics. Callers select the rows because the two schemas express "uses
 * this model" differently.
 */
async function blockForReasonInTx(params: {
  tx: Prisma.TransactionClient;
  projectId: string;
  evalTemplateIds: string[];
  evaluatorIds: string[];
  blockReason: EvaluatorBlockReason;
  blockedAt?: Date;
}): Promise<EvaluatorBlockResult> {
  const { tx, projectId, evaluatorIds, blockReason, blockedAt } = params;
  const blockMessage = getEvaluatorBlockMetadata(blockReason).message;
  const [{ blockedJobConfigIds }, { blockedEvaluatorIds }] = await Promise.all([
    blockEvaluatorConfigsInTx({
      tx,
      projectId,
      where: { evalTemplateId: { in: params.evalTemplateIds } },
      blockReason,
      blockMessage,
      blockedAt,
    }),
    blockEvaluatorsInTx({
      tx,
      projectId,
      evaluatorIds,
      blockReason,
      blockMessage,
      blockedAt,
    }),
  ]);

  return { blockedJobConfigIds, blockedEvaluatorIds };
}

/**
 * Legacy evaluators are `eval_templates` + `job_configurations`; evaluator v2
 * ones are `evaluators` + `evaluator_versions`. Only the *current* evaluator
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
 * Eval templates that pin neither provider nor model, and therefore fall back
 * to the project's default eval model. Managed templates have no project, but
 * the configurations using them do.
 */
export async function findDefaultModelEvalTemplateIds({
  tx,
  projectId,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
}): Promise<string[]> {
  const evalTemplates = await tx.evalTemplate.findMany({
    where: {
      OR: [{ projectId }, { projectId: null }],
      provider: null,
      model: null,
      type: EvalTemplateType.LLM_AS_JUDGE,
    },
    select: { id: true },
  });

  return evalTemplates.map((template) => template.id);
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
  const [evalTemplates, evaluatorIds] = await Promise.all([
    tx.evalTemplate.findMany({
      where: { OR: [{ projectId }, { projectId: null }], provider },
      select: { id: true },
    }),
    findEvaluatorIdsWithCurrentVersion({
      tx,
      projectId,
      matches: (version) => version.provider === provider,
    }),
  ]);

  return blockForReasonInTx({
    tx,
    projectId,
    evalTemplateIds: evalTemplates.map((template) => template.id),
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
  const [evalTemplateIds, evaluatorIds] = await Promise.all([
    findDefaultModelEvalTemplateIds({ tx, projectId }),
    findEvaluatorIdsWithCurrentVersion({
      tx,
      projectId,
      matches: (version) => version.provider === null && version.model === null,
    }),
  ]);

  return blockForReasonInTx({
    tx,
    projectId,
    evalTemplateIds,
    evaluatorIds,
    blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
  });
}

export async function blockEvaluatorConfigs(
  params: BlockEvaluatorConfigsParams,
): Promise<{ blockedJobConfigIds: string[] }> {
  const result = await prisma.$transaction((tx) =>
    blockEvaluatorConfigsInTx({
      tx,
      ...params,
    }),
  );

  await finalizeEvaluatorBlocks({
    projectId: params.projectId,
    source: params.source,
    jobConfigIdsByReason: { [params.blockReason]: result.blockedJobConfigIds },
  });

  return result;
}

/**
 * Evaluator v2 counterpart of {@link blockEvaluatorConfigs}: pauses one
 * evaluator and runs the same notification tail, so an auto-paused v2
 * evaluator is as visible to the project as a legacy one.
 */
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

/**
 * Runs the post-block tail for both data models: one cache invalidation, then
 * per-reason metrics, logging and notification dispatch. The two models need
 * separate notification lookups because they store the evaluator name and its
 * resolution link on different tables.
 */
export async function finalizeEvaluatorBlocks(params: {
  projectId: string;
  source: EvaluatorBlockSource;
  /** Legacy `job_configurations` ids. */
  jobConfigIdsByReason?: BlockedEvaluatorConfigIdsByReason;
  /** Evaluator v2 `evaluators` ids. */
  evaluatorIdsByReason?: BlockedEvaluatorConfigIdsByReason;
}): Promise<void> {
  const batches = [
    {
      blockedByReason: params.jobConfigIdsByReason ?? {},
      notify: notifyBlockedEvaluatorConfigs,
    },
    {
      blockedByReason: params.evaluatorIdsByReason ?? {},
      notify: notifyBlockedEvaluators,
    },
  ].flatMap(({ blockedByReason, notify }) => {
    const notifications =
      getBlockedEvaluatorConfigNotifications(blockedByReason);
    return notifications.length > 0 ? [{ notifications, notify }] : [];
  });

  if (batches.length === 0) {
    return;
  }

  await invalidateProjectEvalConfigCaches(params.projectId);

  for (const batch of batches) {
    emitEvaluatorBlocks({ ...params, ...batch });
  }
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

export async function notifyBlockedEvaluatorConfigs({
  projectId,
  blockedIds: blockedJobConfigIds,
  blockReason,
}: NotifyBlockedEvaluatorsParams): Promise<void> {
  if (blockedJobConfigIds.length === 0) {
    return;
  }

  const blockMessage = getEvaluatorBlockMetadata(blockReason).message;

  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
    select: {
      name: true,
    },
  });

  if (!project) {
    logger.warn(
      `[EVALUATOR BLOCK] Project ${projectId} not found. Skipping notifications.`,
    );
    return;
  }

  const blockedConfigs = await prisma.jobConfiguration.findMany({
    where: {
      projectId,
      id: {
        in: blockedJobConfigIds,
      },
    },
    select: {
      id: true,
      scoreName: true,
      evalTemplate: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (blockedConfigs.length === 0) {
    return;
  }

  // Route to configured notification channels and admin emails, one
  // notification per blocked config. The `blockedAt: null` claim upstream
  // already deduped, so no extra throttle is needed.
  await Promise.allSettled(
    blockedConfigs.map((config) => {
      const evaluatorName = config.evalTemplate?.name ?? config.scoreName;
      const resolutionPath = getEvaluatorBlockResolutionPath({
        projectId,
        blockReason,
        templateId: config.evalTemplate?.id,
      });
      return dispatchProjectNotification({
        projectId,
        event: {
          eventType: "evaluator-blocked",
          severity: "ALERT",
          projectId,
          resourceId: config.id,
          resourceName: evaluatorName,
          message: blockMessage,
          url: env.NEXTAUTH_URL
            ? `${env.NEXTAUTH_URL}${resolutionPath}`
            : undefined,
          projectName: project.name,
          blockReason,
          evalTemplateId: config.evalTemplate?.id,
        },
      });
    }),
  );
}

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
        },
      });
    }),
  );
}
