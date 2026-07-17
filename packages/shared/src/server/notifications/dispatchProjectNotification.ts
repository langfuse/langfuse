import { randomUUID } from "crypto";

import { ActionExecutionStatus, JobConfigState, prisma } from "../../db";
import { TriggerEventSource } from "../../domain/automations";
import { env } from "../../env";
import { getEvaluatorBlockResolutionPath } from "../../features/evals/evalConfigBlocking";
import { logger } from "../logger";
import { QueueJobs, QueueName } from "../queues";
import { WebhookQueue } from "../redis/webhookQueue";
import { getAutomations } from "../repositories/automation-repository";
import { sendBlobStorageExportFailedEmail } from "../services/email/blobStorageExportFailed/sendBlobStorageExportFailedEmail";
import { sendEvaluatorBlockedEmail } from "../services/email/evaluatorBlocked/sendEvaluatorBlockedEmail";
import { getProjectAdminEmails } from "../services/getProjectAdminEmails";
import { type ProjectNotificationEvent } from "./types";

/** ProjectNotificationEmailEnv is the SMTP/env slice the email templates receive. */
type ProjectNotificationEmailEnv = {
  EMAIL_FROM_ADDRESS: string;
  SMTP_CONNECTION_URL: string;
  NEXTAUTH_URL: string;
  CLOUD_CRM_EMAIL: string | undefined;
};

/**
 * dispatchProjectNotification is the single entry point for routing a platform
 * "something went wrong" event to a project's notification channels AND its
 * admin emails — producers make this one call and nothing else. It (1) creates
 * a PENDING AutomationExecution and enqueues one webhook job per active
 * `project-notification` automation that has the event type enabled in its
 * trigger.eventActions, and (2) resolves project admin recipients and sends
 * the event's email template (guarding the SMTP env centrally). Producers own
 * their own dedup (e.g. the blob-storage cooldown claim); this service is
 * stateless and does not add a second dedup layer.
 */
export async function dispatchProjectNotification({
  projectId,
  event,
}: {
  projectId: string;
  event: ProjectNotificationEvent;
}): Promise<void> {
  // Channel dispatch must never suppress the admin email — the email is the
  // always-on floor (worst case for blob-export, whose 24h cooldown claim is
  // already committed by the time we get here). Isolate channel failures.
  try {
    await dispatchToChannels({ projectId, event });
  } catch (error) {
    logger.error(
      `dispatchProjectNotification: channel dispatch failed for ${event.eventType} in project ${projectId}; continuing to admin emails`,
      error,
    );
  }
  await dispatchAdminEmails({ projectId, event });
}

async function dispatchToChannels({
  projectId,
  event,
}: {
  projectId: string;
  event: ProjectNotificationEvent;
}): Promise<void> {
  const queue = WebhookQueue.getInstance();
  if (!queue) {
    logger.warn(
      `dispatchProjectNotification: WebhookQueue unavailable; skipping channel dispatch of ${event.eventType} for project ${projectId}`,
    );
    return;
  }

  const automations = await getAutomations({
    projectId,
    eventSource: TriggerEventSource.ProjectNotification,
  });

  // trigger.eventActions holds the event types the channel has enabled (the
  // per-event toggles in the settings section); channels are created with all
  // events enabled.
  const matching = automations.filter(
    (automation) =>
      automation.trigger.status === JobConfigState.ACTIVE &&
      (automation.trigger.eventActions as string[]).includes(event.eventType),
  );

  for (const automation of matching) {
    const executionId = randomUUID();

    // Mirror the prompt-version path: a PENDING execution row per job, which
    // the worker resolves to COMPLETED/ERROR (and uses for auto-disable).
    await prisma.automationExecution.create({
      data: {
        id: executionId,
        projectId,
        automationId: automation.id,
        triggerId: automation.trigger.id,
        actionId: automation.action.id,
        status: ActionExecutionStatus.PENDING,
        sourceId: event.resourceId,
        input: event,
      },
    });

    await queue.add(QueueName.WebhookQueue, {
      timestamp: new Date(),
      id: randomUUID(),
      name: QueueJobs.WebhookJob,
      payload: {
        projectId,
        automationId: automation.id,
        executionId,
        payload: {
          id: executionId,
          timestamp: new Date(),
          type: "project-notification",
          apiVersion: "v1",
          event,
        },
      },
    });
  }
}

async function dispatchAdminEmails({
  projectId,
  event,
}: {
  projectId: string;
  event: ProjectNotificationEvent;
}): Promise<void> {
  if (
    !env.EMAIL_FROM_ADDRESS ||
    !env.SMTP_CONNECTION_URL ||
    !env.NEXTAUTH_URL
  ) {
    logger.warn(
      `dispatchProjectNotification: missing email env vars; skipping admin emails for ${event.eventType} in project ${projectId}`,
    );
    return;
  }
  const emailEnv: ProjectNotificationEmailEnv = {
    EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
    SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
    NEXTAUTH_URL: env.NEXTAUTH_URL,
    CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
  };

  const receiverEmails = await getProjectAdminEmails(projectId);
  if (receiverEmails.length === 0) {
    logger.warn(
      `dispatchProjectNotification: no project admins found for project ${projectId}; skipping admin emails for ${event.eventType}`,
    );
    return;
  }

  await sendEventAdminEmails({ event, receiverEmails, emailEnv });
}

/** sendEventAdminEmails renders and sends the event's email template to all recipients. */
async function sendEventAdminEmails({
  event,
  receiverEmails,
  emailEnv,
}: {
  event: ProjectNotificationEvent;
  receiverEmails: string[];
  emailEnv: ProjectNotificationEmailEnv;
}): Promise<void> {
  switch (event.eventType) {
    case "blob-export-failed": {
      await sendBlobStorageExportFailedEmail({
        env: emailEnv,
        projectName: event.projectName,
        settingsUrl: `${emailEnv.NEXTAUTH_URL}/project/${event.projectId}/settings/integrations/blobstorage`,
        receiverEmails,
        disabled: event.disabled ?? false,
      });
      return;
    }
    case "evaluator-blocked": {
      const resolutionUrl = `${emailEnv.NEXTAUTH_URL}${getEvaluatorBlockResolutionPath(
        {
          projectId: event.projectId,
          blockReason: event.blockReason,
          templateId: event.evalTemplateId,
        },
      )}`;
      await Promise.allSettled(
        receiverEmails.map((receiverEmail) =>
          sendEvaluatorBlockedEmail({
            env: emailEnv,
            projectName: event.projectName,
            evaluatorName: event.resourceName,
            blockReason: event.blockReason,
            blockMessage: event.message,
            resolutionUrl,
            receiverEmail,
          }),
        ),
      );
      return;
    }
  }
}
