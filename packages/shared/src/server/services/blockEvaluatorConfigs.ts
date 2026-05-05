import { EvaluatorBlockReason, JobConfigState, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { env } from "../../env";
import {
  getEvaluatorBlockMetadata,
  getEvaluatorBlockResolutionPath,
} from "../../features/evals/evalConfigBlocking";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";
import { recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import { sendEvaluatorBlockedEmail } from "./email/evaluatorBlocked/sendEvaluatorBlockedEmail";
import { getProjectAdminEmails } from "./getProjectAdminEmails";

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
  blockedJobConfigIds: string[];
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

export async function blockEvaluatorConfigs(
  params: BlockEvaluatorConfigsParams,
): Promise<{ blockedJobConfigIds: string[] }> {
  const result = await prisma.$transaction((tx) =>
    blockEvaluatorConfigsInTx({
      tx,
      ...params,
    }),
  );

  await finalizeBlockedEvaluatorConfigBlocks({
    projectId: params.projectId,
    source: params.source,
    blockedByReason: {
      [params.blockReason]: result.blockedJobConfigIds,
    },
  });

  return result;
}

export async function finalizeBlockedEvaluatorConfigBlocks(params: {
  projectId: string;
  source: EvaluatorBlockSource;
  blockedByReason: BlockedEvaluatorConfigIdsByReason;
}): Promise<void> {
  const blockedNotifications = getBlockedEvaluatorConfigNotifications(
    params.blockedByReason,
  );

  if (blockedNotifications.length === 0) {
    return;
  }

  await invalidateProjectEvalConfigCaches(params.projectId);

  for (const notification of blockedNotifications) {
    const blockedCount = notification.blockedJobConfigIds.length;

    recordIncrement("langfuse.evals.blocked_total", blockedCount, {
      reason: notification.blockReason,
      source: params.source,
    });

    logger.info(
      `[EVALUATOR BLOCK] Blocked evaluator configs for project ${params.projectId}, reason: ${notification.blockReason}, source: ${params.source}, blocked_count: ${blockedCount}`,
    );

    notifyBlockedEvaluatorConfigsInBackground({
      projectId: params.projectId,
      ...notification,
    });
  }
}

const getBlockedEvaluatorConfigNotifications = (
  blockedByReason: BlockedEvaluatorConfigIdsByReason,
): BlockedEvaluatorConfigNotification[] =>
  Object.entries(blockedByReason).flatMap(
    ([blockReason, blockedJobConfigIds]) =>
      blockedJobConfigIds?.length
        ? [
            {
              blockReason: blockReason as EvaluatorBlockReason,
              blockedJobConfigIds,
            },
          ]
        : [],
  );

const notifyBlockedEvaluatorConfigsInBackground = (
  params: NotifyBlockedEvaluatorConfigsParams,
): void => {
  void notifyBlockedEvaluatorConfigs(params).catch((error) =>
    logger.error(
      "[EVALUATOR BLOCK] Failed to send blocked evaluator notifications",
      error,
    ),
  );
};

type NotifyBlockedEvaluatorConfigsParams = {
  projectId: string;
  blockedJobConfigIds: string[];
  blockReason: EvaluatorBlockReason;
};

export async function notifyBlockedEvaluatorConfigs({
  projectId,
  blockedJobConfigIds,
  blockReason,
}: NotifyBlockedEvaluatorConfigsParams): Promise<void> {
  if (blockedJobConfigIds.length === 0) {
    return;
  }

  const blockMessage = getEvaluatorBlockMetadata(blockReason).message;

  const emailEnv = {
    EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
    SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
    NEXTAUTH_URL: env.NEXTAUTH_URL,
    CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
  };

  if (
    !emailEnv.EMAIL_FROM_ADDRESS ||
    !emailEnv.SMTP_CONNECTION_URL ||
    !emailEnv.NEXTAUTH_URL
  ) {
    logger.warn(
      `[EVALUATOR BLOCK] Missing email env vars. Skipping notifications for project ${projectId}.`,
    );
    return;
  }

  const adminEmails = await getProjectAdminEmails(projectId);
  if (adminEmails.length === 0) {
    logger.warn(
      `[EVALUATOR BLOCK] No project admins found for project ${projectId}.`,
    );
    return;
  }

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

  const emailJobs = blockedConfigs.flatMap((config) =>
    adminEmails.map((receiverEmail) =>
      sendEvaluatorBlockedEmail({
        env: emailEnv,
        projectName: project.name,
        evaluatorName: config.evalTemplate?.name ?? config.scoreName,
        blockReason,
        blockMessage,
        resolutionUrl: `${emailEnv.NEXTAUTH_URL}${getEvaluatorBlockResolutionPath(
          {
            projectId,
            blockReason,
            templateId: config.evalTemplate?.id,
          },
        )}`,
        receiverEmail,
      }),
    ),
  );

  await Promise.allSettled(emailJobs);
}
