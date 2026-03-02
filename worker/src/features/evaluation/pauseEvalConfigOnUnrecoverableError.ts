import {
  JobConfigState,
  JobExecutionStatus,
  LlmApiKeyStatus,
  Role,
} from "@langfuse/shared";
import {
  clearNoEvalConfigsCache,
  sendEvalPausedEmail,
  logger,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

async function getProjectOwnerEmails(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { orgId: true },
  });
  if (!project) return [];

  const projectOwners = await prisma.projectMembership.findMany({
    where: {
      projectId,
      role: Role.OWNER,
    },
    include: {
      user: { select: { email: true } },
    },
  });
  const emails = projectOwners
    .map((m) => m.user.email)
    .filter((email): email is string => !!email);
  if (emails.length > 0) return emails;

  const orgOwners = await prisma.organizationMembership.findMany({
    where: {
      orgId: project.orgId,
      role: Role.OWNER,
    },
    include: {
      user: { select: { email: true } },
    },
  });
  return orgOwners
    .map((m) => m.user.email)
    .filter((email): email is string => !!email);
}

export type PauseEvalConfigParams = {
  jobExecutionId: string;
  projectId: string;
  statusCode: number | null;
  errorMessage: string;
};

function getPauseReason(statusCode: number | null, errorMessage: string) {
  if (statusCode === 401) {
    return {
      code: "LLM_401",
      keyMessage:
        "LLM API returned 401 Unauthorized. Check your LLM connection.",
      configMessage:
        "Evaluator paused: LLM API returned 401 Unauthorized. Update the LLM connection used by this evaluator and then reactivate it.",
    } as const;
  }

  if (statusCode === 404) {
    return {
      code: "LLM_404",
      keyMessage: null,
      configMessage:
        "Evaluator paused: model not found (404). Update the evaluator template or the default evaluation model, then reactivate it.",
    } as const;
  }

  if (
    errorMessage.includes('API key for provider "') &&
    errorMessage.includes('" not found in project')
  ) {
    return {
      code: "LLM_KEY_MISSING",
      keyMessage: null,
      configMessage:
        "Evaluator paused: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
    } as const;
  }

  if (errorMessage.includes("No default model or custom model configured")) {
    return {
      code: "MODEL_CONFIG_MISSING",
      keyMessage: null,
      configMessage:
        "Evaluator paused: no valid evaluation model is configured. Set a model on the evaluator template or configure a default evaluation model, then reactivate it.",
    } as const;
  }

  return {
    code: "ERROR",
    keyMessage: null,
    configMessage: errorMessage,
  } as const;
}

export async function pauseEvalConfigOnUnrecoverableError({
  jobExecutionId,
  projectId,
  statusCode,
  errorMessage,
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

  const config = await prisma.jobConfiguration.findFirst({
    where: {
      id: jobExecution.jobConfigurationId,
      projectId,
    },
    include: {
      evalTemplate: true,
    },
  });

  if (!config) {
    return;
  }

  const template =
    config.evalTemplate ??
    (jobExecution.jobTemplateId
      ? await prisma.evalTemplate.findUnique({
          where: { id: jobExecution.jobTemplateId },
        })
      : null);

  if (!template) {
    return;
  }

  const pauseReason = getPauseReason(statusCode, errorMessage);

  const shouldNotify = await prisma.$transaction(async (tx) => {
    if (statusCode === 401 && pauseReason.keyMessage) {
      const defaultModel = await tx.defaultLlmModel.findUnique({
        where: { projectId },
        select: { provider: true },
      });

      const provider = template.provider ?? defaultModel?.provider ?? null;

      if (provider) {
        const key = await tx.llmApiKeys.findFirst({
          where: {
            projectId,
            provider,
          },
          select: { id: true },
        });

        if (key) {
          await tx.llmApiKeys.update({
            where: { id: key.id },
            data: {
              status: LlmApiKeyStatus.ERROR,
              statusMessage: pauseReason.keyMessage,
            },
          });
        }
      }
    }

    if (config.status === JobConfigState.INACTIVE) {
      return false;
    }

    const now = new Date();

    await tx.jobConfiguration.update({
      where: { id: config.id },
      data: {
        status: JobConfigState.INACTIVE,
        statusMessage: pauseReason.configMessage,
      },
    });

    await tx.jobExecution.updateMany({
      where: {
        id: {
          not: jobExecutionId,
        },
        jobConfigurationId: config.id,
        projectId,
        status: JobExecutionStatus.PENDING,
      },
      data: {
        status: JobExecutionStatus.CANCELLED,
        endTime: now,
      },
    });

    return true;
  });

  if (!shouldNotify) {
    return;
  }

  await clearNoEvalConfigsCache(projectId, "traceBased");
  await clearNoEvalConfigsCache(projectId, "eventBased");

  if (
    !env.NEXTAUTH_URL ||
    !env.EMAIL_FROM_ADDRESS ||
    !env.SMTP_CONNECTION_URL
  ) {
    logger.warn(
      `[EVAL PAUSE] Missing env for email. Config ${config.id} paused but no notification sent.`,
    );
    return;
  }

  const ownerEmails = await getProjectOwnerEmails(projectId);

  if (ownerEmails.length === 0) {
    logger.warn(
      `[EVAL PAUSE] No project owner emails found for project ${projectId}. Config ${config.id} paused.`,
    );
    return;
  }

  const resolutionUrl = `${env.NEXTAUTH_URL}/project/${projectId}/evals/templates/${template.id}`;
  await Promise.allSettled(
    ownerEmails.map((email) =>
      sendEvalPausedEmail({
        env: {
          EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
          SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
          NEXTAUTH_URL: env.NEXTAUTH_URL,
          CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
        },
        templateName: template.name,
        pauseReason: pauseReason.configMessage,
        pauseReasonCode: pauseReason.code,
        resolutionUrl,
        receiverEmail: email,
      }),
    ),
  );
}
