import {
  EVAL_SUSPEND_EMAIL_DEBOUNCE_MS,
  JobConfigState,
  JobConfigSuspendCode,
  JobExecutionStatus,
  LlmApiKeyStatus,
  getEvalSuspendResolutionPath,
  getJobConfigSuspendMeta,
} from "@langfuse/shared";
import {
  clearAllEvalConfigsCaches,
  getProjectOwnerEmails,
  sendEvalPausedEmail,
  logger,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

export type PauseEvalConfigParams = {
  jobExecutionId: string;
  projectId: string;
  suspendCode: JobConfigSuspendCode;
};

export async function pauseEvalConfigOnUnrecoverableError({
  jobExecutionId,
  projectId,
  suspendCode,
}: PauseEvalConfigParams): Promise<void> {
  const jobExecution = await prisma.jobExecution.findFirst({
    where: {
      id: jobExecutionId,
      projectId,
    },
    select: {
      jobConfigurationId: true,
      jobTemplateId: true,
    },
  });

  if (!jobExecution?.jobConfigurationId) {
    return;
  }

  const meta = getJobConfigSuspendMeta(suspendCode);
  const now = new Date();

  const suspensionResult = await prisma.$transaction(async (tx) => {
    const currentConfig = await tx.jobConfiguration.findFirst({
      where: {
        id: jobExecution.jobConfigurationId,
        projectId,
      },
      select: {
        suspendedAt: true,
        evalTemplate: {
          select: {
            provider: true,
          },
        },
      },
    });

    // Atomic: only ACTIVE configs can transition to SUSPENDED (prevents race conditions and INACTIVE overwrite)
    const { count } = await tx.jobConfiguration.updateMany({
      where: {
        id: jobExecution.jobConfigurationId!,
        projectId,
        status: JobConfigState.ACTIVE,
      },
      data: {
        status: JobConfigState.SUSPENDED,
        statusMessage: meta.configMessage,
        suspendCode,
        suspendedAt: now,
      },
    });

    if (count === 0) {
      return { didSuspend: false, shouldNotify: false };
    }

    await tx.jobExecution.updateMany({
      where: {
        id: { not: jobExecutionId },
        jobConfigurationId: jobExecution.jobConfigurationId!,
        projectId,
        status: JobExecutionStatus.PENDING,
      },
      data: {
        status: JobExecutionStatus.CANCELLED,
        endTime: now,
      },
    });

    // Mark the API key as errored only on 401 and only on first suspension
    if (suspendCode === JobConfigSuspendCode.LLM_401 && meta.keyMessage) {
      const defaultModel = await tx.defaultLlmModel.findUnique({
        where: { projectId },
        select: { provider: true },
      });
      const provider =
        currentConfig?.evalTemplate?.provider ?? defaultModel?.provider ?? null;

      if (provider) {
        const key = await tx.llmApiKeys.findFirst({
          where: { projectId, provider },
          select: { id: true },
        });

        if (key) {
          await tx.llmApiKeys.update({
            where: { id: key.id },
            data: {
              status: LlmApiKeyStatus.ERROR,
              statusMessage: meta.keyMessage,
            },
          });
        }
      }
    }

    const shouldNotify =
      !currentConfig?.suspendedAt ||
      now.getTime() - currentConfig.suspendedAt.getTime() >
        EVAL_SUSPEND_EMAIL_DEBOUNCE_MS;

    return { didSuspend: true, shouldNotify };
  });

  if (!suspensionResult.didSuspend) {
    return;
  }

  await clearAllEvalConfigsCaches(projectId);

  if (!suspensionResult.shouldNotify) {
    logger.debug(
      `[EVAL SUSPEND] Skipping notification for config ${jobExecution.jobConfigurationId} due to debounce window.`,
    );
    return;
  }

  // Look up template info for the notification email (best-effort)
  const config = await prisma.jobConfiguration.findFirst({
    where: {
      id: jobExecution.jobConfigurationId,
      projectId,
    },
    include: { evalTemplate: true },
  });

  const template =
    config?.evalTemplate ??
    (jobExecution.jobTemplateId
      ? await prisma.evalTemplate.findUnique({
          where: { id: jobExecution.jobTemplateId },
        })
      : null);

  if (!template) {
    logger.warn(
      `[EVAL SUSPEND] Template not found for config ${jobExecution.jobConfigurationId}. Suspended but no notification sent.`,
    );
    return;
  }

  // Fire-and-forget: email notification should not block the eval worker
  void sendSuspendNotification({
    projectId,
    configId: jobExecution.jobConfigurationId,
    templateId: template.id,
    templateName: template.name,
    suspendCode,
    configMessage: meta.configMessage,
    shortMessage: meta.shortMessage,
  }).catch((e) =>
    logger.error("[EVAL SUSPEND] Failed to send suspend notification", e),
  );
}

async function sendSuspendNotification({
  projectId,
  configId,
  templateId,
  templateName,
  suspendCode,
  configMessage,
  shortMessage,
}: {
  projectId: string;
  configId: string;
  templateId: string;
  templateName: string;
  suspendCode: JobConfigSuspendCode;
  configMessage: string;
  shortMessage: string;
}): Promise<void> {
  if (
    !env.NEXTAUTH_URL ||
    !env.EMAIL_FROM_ADDRESS ||
    !env.SMTP_CONNECTION_URL
  ) {
    logger.warn(
      `[EVAL SUSPEND] Missing env for email. Config ${configId} suspended but no notification sent.`,
    );
    return;
  }

  const ownerEmails = await getProjectOwnerEmails(projectId);

  if (ownerEmails.length === 0) {
    logger.warn(
      `[EVAL SUSPEND] No project owner emails found for project ${projectId}. Config ${configId} suspended.`,
    );
    return;
  }

  const resolutionUrl = `${env.NEXTAUTH_URL}${getEvalSuspendResolutionPath({
    projectId,
    suspendCode,
    templateId,
  })}`;
  await Promise.allSettled(
    ownerEmails.map((email) =>
      sendEvalPausedEmail({
        env: {
          EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
          SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
          NEXTAUTH_URL: env.NEXTAUTH_URL,
          CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
        },
        templateName,
        pauseReason: configMessage,
        pauseReasonShort: shortMessage,
        pauseReasonCode: suspendCode,
        resolutionUrl,
        receiverEmail: email,
      }),
    ),
  );
}
