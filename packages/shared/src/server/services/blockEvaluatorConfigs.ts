import { EvaluatorBlockReason, JobConfigState, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { env } from "../../env";
import { getEvaluatorBlockResolutionPath } from "../../features/evals/evalConfigBlocking";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";
import { logger } from "../logger";
import { sendEvaluatorBlockedEmail } from "./email/evaluatorBlocked/sendEvaluatorBlockedEmail";
import { getProjectAdminEmails } from "./getProjectAdminEmails";

type BlockEvaluatorConfigsParams = {
  projectId: string;
  where: Prisma.JobConfigurationWhereInput;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  blockedAt?: Date;
};

type BlockEvaluatorConfigsInTxParams = BlockEvaluatorConfigsParams & {
  tx: Prisma.TransactionClient;
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
      AND: [where, { projectId, status: JobConfigState.ACTIVE }],
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

  if (result.blockedJobConfigIds.length > 0) {
    await invalidateProjectEvalConfigCaches(params.projectId);

    void notifyBlockedEvaluatorConfigs({
      projectId: params.projectId,
      blockedJobConfigIds: result.blockedJobConfigIds,
      blockReason: params.blockReason,
      blockMessage: params.blockMessage,
    }).catch((error) =>
      logger.error(
        "[EVALUATOR BLOCK] Failed to send blocked evaluator notifications",
        error,
      ),
    );
  }

  return result;
}

type NotifyBlockedEvaluatorConfigsParams = {
  projectId: string;
  blockedJobConfigIds: string[];
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
};

export async function notifyBlockedEvaluatorConfigs({
  projectId,
  blockedJobConfigIds,
  blockReason,
  blockMessage,
}: NotifyBlockedEvaluatorConfigsParams): Promise<void> {
  if (blockedJobConfigIds.length === 0) {
    return;
  }

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
