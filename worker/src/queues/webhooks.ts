import {
  InternalServerError,
  PromptWebhookOutboundSchema,
  WebhookDefaultHeaders,
  ActionExecutionStatus,
  LangfuseNotFoundError,
  JobConfigState,
  isSlackActionConfig,
  isWebhookAction,
} from "@langfuse/shared";
import { decrypt, createSignatureHeader } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  TQueueJobTypes,
  QueueName,
  WebhookInput,
  getAutomationById,
  getActionByIdWithSecrets,
  getActionById,
  getConsecutiveAutomationFailures,
  SlackService,
  logger,
} from "@langfuse/shared/src/server";
import { Processor, Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { env } from "../env";
import { SlackMessageBuilder } from "../features/slack/slackMessageBuilder";

export const webhookProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.WebhookQueue]>,
) => {
  try {
    return await executeWebhook(job.data.payload);
  } catch (error) {
    logger.error("Error executing WebhookJob", error);
    throw error;
  }
};

// TODO: Webhook outgoing API versioning
export const executeWebhook = async (input: WebhookInput) => {
  const executionStart = new Date();
  const { projectId, automationId } = input;

  try {
    logger.debug(`Executing action for automation ${automationId}`);

    const automation = await getAutomationById({
      projectId,
      automationId,
    });

    if (!automation) {
      logger.warn(
        `Automation ${automationId} not found for project ${projectId}. We ack the job and will not retry.`,
      );
      return;
    }

    // Route to appropriate handler based on action type
    if (automation.action.type === "WEBHOOK") {
      await executeWebhookAction({
        input,
        automation,
        executionStart,
      });
    } else if (automation.action.type === "SLACK") {
      await executeSlackAction({
        input,
        automation,
        executionStart,
      });
    } else {
      throw new InternalServerError(
        `Unsupported action type: ${automation.action.type}`,
      );
    }

    logger.debug(
      `Action executed successfully for action ${automation.action.id}`,
    );
  } catch (error) {
    logger.error("Error executing action", error);
    await handleActionFailure({
      error,
      input,
      executionStart,
    });
  }
};

/**
 * Execute webhook action with HTTP request and signature validation
 */
async function executeWebhookAction({
  input,
  automation,
  executionStart,
}: {
  input: WebhookInput;
  automation: Awaited<ReturnType<typeof getAutomationById>>;
  executionStart: Date;
}) {
  if (!automation) return;

  const { projectId, executionId } = input;
  let responseBody: string | undefined;

  const actionConfig = await getActionByIdWithSecrets({
    projectId,
    actionId: automation.action.id,
  });

  if (!actionConfig) {
    throw new InternalServerError("Action config not found");
  }

  if (!isWebhookAction(actionConfig)) {
    throw new InternalServerError(
      "Action config is not a valid webhook configuration",
    );
  }

  const webhookConfig = actionConfig.config;

  // Validate and prepare webhook payload
  const validatedPayload = PromptWebhookOutboundSchema.safeParse({
    id: input.executionId,
    timestamp: new Date(),
    type: input.payload.type,
    apiVersion: "v1",
    action: input.payload.action,
    prompt: input.payload.prompt,
  });

  if (!validatedPayload.success) {
    throw new InternalServerError(
      `Invalid webhook payload: ${validatedPayload.error.message}`,
    );
  }

  // Prepare webhook payload with prompt always last
  const { prompt, ...otherFields } = validatedPayload.data;
  const webhookPayload = JSON.stringify({
    ...otherFields,
    prompt,
  });

  // Prepare headers with signature if secret exists
  const requestHeaders: Record<string, string> = {};

  // Add webhook config headers first
  for (const [key, value] of Object.entries(webhookConfig.requestHeaders)) {
    requestHeaders[key] = value.value;
  }

  // Add default headers with precedence
  for (const [key, value] of Object.entries(WebhookDefaultHeaders)) {
    requestHeaders[key] = value;
  }

  if (!webhookConfig.secretKey) {
    logger.warn(
      `Webhook config for action ${automation.action.id} has no secret key, failing webhook execution`,
    );
    throw new InternalServerError(
      "Webhook config has no secret key, failing webhook execution",
    );
  }

  try {
    const decryptedSecret = decrypt(webhookConfig.secretKey);
    const signature = createSignatureHeader(webhookPayload, decryptedSecret);
    requestHeaders["x-langfuse-signature"] = signature;
  } catch (error) {
    logger.error(
      "Failed to decrypt webhook secret or generate signature",
      error,
    );
    throw new InternalServerError("Failed to generate webhook signature");
  }

  // Execute webhook with retries
  await backOff(
    async () => {
      logger.debug(
        `Sending webhook to ${webhookConfig.url} with payload ${JSON.stringify(
          webhookPayload,
        )} and headers ${JSON.stringify(requestHeaders)}`,
      );

      // Create AbortController for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, env.LANGFUSE_WEBHOOK_TIMEOUT_MS);

      try {
        const res = await fetch(webhookConfig.url, {
          method: "POST",
          body: webhookPayload,
          headers: requestHeaders,
          signal: abortController.signal,
        });

        responseBody = await res.text();

        if (res.status !== 200) {
          logger.warn(
            `Webhook failed with status ${res.status} for url ${webhookConfig.url} and project ${projectId}. Body: ${responseBody}`,
          );
          throw new Error(
            `Webhook failed with status ${res.status} for url ${webhookConfig.url} and project ${projectId}`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          logger.warn(
            `Webhook timeout after ${env.LANGFUSE_WEBHOOK_TIMEOUT_MS}ms for url ${webhookConfig.url} and project ${projectId}`,
          );
          throw new Error(
            `Webhook timeout after ${env.LANGFUSE_WEBHOOK_TIMEOUT_MS}ms for url ${webhookConfig.url} and project ${projectId}`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      numOfAttempts: 4,
    },
  );

  // Update execution status on success
  await prisma.automationExecution.update({
    where: {
      projectId,
      triggerId: automation.trigger.id,
      actionId: automation.action.id,
      id: executionId,
    },
    data: {
      status: ActionExecutionStatus.COMPLETED,
      startedAt: executionStart,
      finishedAt: new Date(),
    },
  });
}

/**
 * Execute Slack action with message sending via SlackService
 */
async function executeSlackAction({
  input,
  automation,
  executionStart,
}: {
  input: WebhookInput;
  automation: Awaited<ReturnType<typeof getAutomationById>>;
  executionStart: Date;
}) {
  if (!automation) return;

  const { projectId, executionId } = input;

  const actionConfig = await getActionById({
    projectId,
    actionId: automation.action.id,
  });

  if (!actionConfig) {
    throw new InternalServerError("Action config not found");
  }

  if (!isSlackActionConfig(actionConfig.config)) {
    throw new InternalServerError(
      "Action config is not a valid Slack configuration",
    );
  }

  const slackConfig = actionConfig.config;

  // Build message blocks using predefined formats or custom template
  let blocks: any[] = [];

  // TODO: Custom templates not supported via the UI yet
  if (slackConfig.messageTemplate) {
    try {
      blocks = JSON.parse(slackConfig.messageTemplate);
      logger.debug(
        `Using custom message template for action ${automation.action.id}`,
      );
    } catch (error) {
      logger.warn(
        `Invalid Slack messageTemplate JSON for action ${automation.action.id}. Using default format`,
        { error: error instanceof Error ? error.message : "Unknown error" },
      );
    }
  }

  // Use predefined message format if no custom template or template failed
  if (blocks.length === 0) {
    blocks = SlackMessageBuilder.buildMessage(input.payload);
    logger.debug(
      `Using predefined message format for action ${automation.action.id}`,
    );
  }

  // Get Slack WebClient for project via centralized SlackService
  const client =
    await SlackService.getInstance().getWebClientForProject(projectId);

  // Send message
  const sendResult = await SlackService.getInstance().sendMessage({
    client,
    channelId: slackConfig.channelId,
    blocks,
    text: "Langfuse Notification",
  });

  // Update execution status to completed
  await prisma.automationExecution.update({
    where: {
      projectId,
      triggerId: automation.trigger.id,
      actionId: automation.action.id,
      id: executionId,
    },
    data: {
      status: ActionExecutionStatus.COMPLETED,
      startedAt: executionStart,
      finishedAt: new Date(),
      output: {
        channel: sendResult.channel,
        messageTs: sendResult.messageTs,
      },
    },
  });
}

/**
 * Handle action execution failure with retry logic and trigger disabling
 */
async function handleActionFailure({
  error,
  input,
  executionStart,
}: {
  error: unknown;
  input: WebhookInput;
  executionStart: Date;
}) {
  const { projectId, automationId, executionId } = input;

  const automation = await getAutomationById({ projectId, automationId });
  if (!automation) {
    logger.warn(
      `Automation ${automationId} not found for project ${projectId}. We ack the job and will not retry.`,
    );
    return;
  }

  const shouldRetryJob =
    error instanceof LangfuseNotFoundError ||
    error instanceof InternalServerError;

  if (shouldRetryJob) {
    logger.warn(
      `Retrying BullMQ for action job for action ${automation.action.id}`,
    );
    throw error; // Trigger BullMQ retry
  }

  const maxFailures = automation.action.type === "WEBHOOK" ? 4 : 1;

  // Update execution status and check if we should disable trigger
  await prisma.$transaction(async (tx) => {
    // Update execution status
    await tx.automationExecution.update({
      where: {
        id: executionId,
        projectId,
        triggerId: automation.trigger.id,
        actionId: automation.action.id,
      },
      data: {
        status: ActionExecutionStatus.ERROR,
        startedAt: executionStart,
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Check consecutive failures from execution history
    const consecutiveFailures = await getConsecutiveAutomationFailures({
      automationId,
      projectId,
    });

    logger.info(
      `Consecutive failures: ${consecutiveFailures} for trigger ${automation.trigger.id} in project ${projectId}`,
    );

    // Check if trigger should be disabled (this is the 5th failure, looking for 4 in the past.)
    if (consecutiveFailures >= maxFailures) {
      await tx.trigger.update({
        where: { id: automation.trigger.id, projectId },
        data: { status: JobConfigState.INACTIVE },
      });

      logger.warn(
        `Automation ${automation.trigger.id} disabled after ${consecutiveFailures} consecutive failures in project ${projectId}`,
      );
    }
  });

  logger.debug(
    `Action failed for action ${automation.action.id} in project ${projectId}`,
  );
}
