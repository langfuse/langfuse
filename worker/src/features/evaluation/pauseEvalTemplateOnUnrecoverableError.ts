import {
  JobConfigState,
  JobExecutionStatus,
  Role,
  EvalTemplateStatus,
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

export type PauseEvalTemplateParams = {
  jobExecutionId: string;
  projectId: string;
  statusCode: number;
  errorMessage: string;
};

/**
 * Set eval template status to ERROR and pause its evaluators when an unrecoverable LLM error occurs.
 * - Leaves template provider/model/modelParams unchanged; user must edit and save to clear error.
 * - Sets template status to ERROR (statusReason: { code, description }, statusUpdatedAt)
 * - Sets lastError on the LlmApiKeys row used for the call (for observability/tracking).
 * - Scope: if the template used the default model → delete the default model + pause all other
 *   templates that also depend on it. If it had a specific model → pause only that template.
 *   This logic is the same regardless of whether the error was 401 or 404.
 * - Deactivates all evaluators (job configs) for paused templates; cancels their PENDING executions.
 * - Clears eval caches
 * - Sends email to project owners (once per template)
 */
export async function pauseEvalTemplateOnUnrecoverableError({
  jobExecutionId,
  projectId,
  statusCode,
  errorMessage,
}: PauseEvalTemplateParams): Promise<void> {
  const jobExecution = await prisma.jobExecution.findFirst({
    where: {
      id: jobExecutionId,
      projectId,
    },
    select: { jobTemplateId: true },
  });

  if (!jobExecution?.jobTemplateId) {
    return;
  }

  const jobTemplateId = jobExecution.jobTemplateId;

  const template = await prisma.evalTemplate.findUnique({
    where: { id: jobTemplateId },
  });

  if (!template) {
    return;
  }

  if (template.status === EvalTemplateStatus.ERROR) {
    return;
  }

  const statusReason = {
    code:
      statusCode === 401 ? "LLM_401" : statusCode === 404 ? "LLM_404" : `ERROR`,
    description:
      statusCode === 401
        ? "LLM API returned 401 Unauthorized. Check your LLM connection."
        : statusCode === 404
          ? "Model not found (404). The configured model may have been deleted. Update the evaluator or default evaluation model."
          : errorMessage,
  };
  const usedDefaultModel =
    template.provider === null && template.model === null;

  await prisma.$transaction(async (tx) => {
    const defaultModel = await tx.defaultLlmModel.findUnique({
      where: { projectId },
      select: { provider: true, llmApiKeyId: true },
    });
    const provider = template.provider ?? defaultModel?.provider ?? null;
    let llmApiKey: { id: string; provider: string } | null = null;
    if (provider) {
      const key = await tx.llmApiKeys.findFirst({
        where: { projectId, provider },
        select: { id: true, provider: true },
      });
      if (key) llmApiKey = key;
    }

    if (llmApiKey) {
      await tx.llmApiKeys.update({
        where: { id: llmApiKey.id },
        data: { lastError: statusReason },
      });
    }

    let templateIdsForJobConfigs: string[];
    let templateIdsForStatusUpdate: string[];
    if (usedDefaultModel) {
      // Template used the default model → delete the default model and pause all templates
      // (project-scoped + global) that depend on it (provider: null, model: null).
      const templatesUsingDefault = await tx.evalTemplate.findMany({
        where: {
          OR: [{ projectId }, { projectId: null }],
          provider: null,
          model: null,
          status: { not: EvalTemplateStatus.ERROR },
        },
        select: { id: true, projectId: true },
      });
      templateIdsForJobConfigs = templatesUsingDefault.map((t) => t.id);
      templateIdsForStatusUpdate = templatesUsingDefault
        .filter((t) => t.projectId !== null)
        .map((t) => t.id);
      await tx.defaultLlmModel.deleteMany({ where: { projectId } });
    } else {
      // Template had a specific model → pause only this template.
      templateIdsForJobConfigs = [jobTemplateId];
      templateIdsForStatusUpdate =
        template.projectId !== null ? [jobTemplateId] : [];
    }

    const now = new Date();
    if (templateIdsForStatusUpdate.length > 0) {
      await tx.evalTemplate.updateMany({
        where: { id: { in: templateIdsForStatusUpdate } },
        data: {
          status: EvalTemplateStatus.ERROR,
          statusReason,
          statusUpdatedAt: now,
        },
      });
    }
    if (templateIdsForJobConfigs.length > 0) {
      await tx.jobConfiguration.updateMany({
        where: { evalTemplateId: { in: templateIdsForJobConfigs } },
        data: { status: JobConfigState.INACTIVE },
      });

      await tx.jobExecution.updateMany({
        where: {
          jobTemplateId: { in: templateIdsForJobConfigs },
          projectId,
          status: JobExecutionStatus.PENDING,
        },
        data: {
          status: JobExecutionStatus.CANCELLED,
          endTime: now,
        },
      });
    }
  });

  await clearNoEvalConfigsCache(projectId, "traceBased");
  await clearNoEvalConfigsCache(projectId, "eventBased");

  if (
    !env.NEXTAUTH_URL ||
    !env.EMAIL_FROM_ADDRESS ||
    !env.SMTP_CONNECTION_URL
  ) {
    logger.warn(
      `[EVAL PAUSE] Missing env for email. Template ${template.name} paused but no notification sent.`,
    );
    return;
  }

  const ownerEmails = await getProjectOwnerEmails(projectId);

  if (ownerEmails.length === 0) {
    logger.warn(
      `[EVAL PAUSE] No project owner emails found for project ${projectId}. Template ${template.name} paused.`,
    );
    return;
  }

  if (usedDefaultModel) {
    // One project-level email when default model was removed (may affect global + project templates).
    const resolutionUrl = `${env.NEXTAUTH_URL}/project/${projectId}/evals/default-model`;
    await Promise.allSettled(
      ownerEmails.map((email) =>
        sendEvalPausedEmail({
          env: {
            EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
            SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
            NEXTAUTH_URL: env.NEXTAUTH_URL,
            CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
          },
          templateName: "Templates using default evaluation model",
          pauseReason: statusReason.description,
          pauseReasonCode: statusReason.code,
          resolutionUrl,
          receiverEmail: email,
        }),
      ),
    );
  } else {
    // Specific model: one email per template we set to ERROR (single template).
    const resolutionUrl = `${env.NEXTAUTH_URL}/project/${projectId}/evals/templates/${jobTemplateId}`;
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
          pauseReason: statusReason.description,
          pauseReasonCode: statusReason.code,
          resolutionUrl,
          receiverEmail: email,
        }),
      ),
    );
  }
}
