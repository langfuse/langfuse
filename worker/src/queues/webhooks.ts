import {
  InternalServerError,
  PromptWebhookOutboundSchema,
  WebhookDefaultHeaders,
  ActionExecutionStatus,
  LangfuseNotFoundError,
  JobConfigState,
} from "@langfuse/shared";
import { decrypt, createSignatureHeader } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  TQueueJobTypes,
  QueueName,
  WebhookInput,
  getAutomationById,
  getActionByIdWithSecrets,
  getConsecutiveAutomationFailures,
  logger,
} from "@langfuse/shared/src/server";
import { Processor, Job } from "bullmq";
import { backOff } from "exponential-backoff";
import { env } from "../env";

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

  const { projectId, automationId, executionId } = input;
  let httpStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    logger.debug(`Executing webhook for automation ${automationId}`);

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

    const actionConfig = await getActionByIdWithSecrets({
      projectId,
      actionId: automation.action.id,
    });

    if (!actionConfig) {
      throw new Error("Action config not found");
    }

    if (actionConfig.config.type !== "WEBHOOK") {
      throw new InternalServerError("Action config is not a webhook");
    }

    // TypeScript now knows actionConfig.config is WebhookActionConfig
    const webhookConfig = actionConfig.config;

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
    const requestHeaders: Record<string, string> = {
      ...WebhookDefaultHeaders,
      ...webhookConfig.headers,
    };

    if (!webhookConfig.secretKey) {
      logger.warn(
        `Webhook config for action ${automation.action.id} has no secret key, failing webhook execution`,
      );
      throw new InternalServerError(
        "Webhook config has no secret key, failing webhook execution",
      );
    }

    if (webhookConfig.secretKey) {
      try {
        const decryptedSecret = decrypt(webhookConfig.secretKey);

        const signature = createSignatureHeader(
          webhookPayload,
          decryptedSecret,
        );
        requestHeaders["x-langfuse-signature"] = signature;
      } catch (error) {
        logger.error(
          "Failed to decrypt webhook secret or generate signature",
          error,
        );
        throw new InternalServerError("Failed to generate webhook signature");
      }
    }

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

          httpStatus = res.status;
          responseBody = await res.text();

          if (res.status !== 200) {
            logger.warn(
              `Webhook does not return 200: failed with status ${res.status} for url ${webhookConfig.url} and project ${projectId}. Body: ${responseBody}`,
            );
            throw new Error(
              `Webhook does not return 200: failed with status ${res.status} for url ${webhookConfig.url} and project ${projectId}`,
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
        numOfAttempts: 4, // no retries for webhook calls via BullMQ
      },
    );

    // Update action execution status on success
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

    logger.debug(
      `Webhook executed successfully for action ${automation.action.id}`,
    );
  } catch (error) {
    logger.error("Error executing webhook", error);

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

    const shouldRetryJob =
      error instanceof LangfuseNotFoundError ||
      error instanceof InternalServerError;

    if (shouldRetryJob) {
      logger.warn(
        `Retrying bullmq for webhook job for action ${automation.action.id}`,
      );
      throw error;
    }

    // Update action execution status and check if we should disable trigger
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
          output: httpStatus
            ? {
                httpStatus,
                responseBody: responseBody?.substring(0, 1000),
              }
            : undefined,
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
      if (consecutiveFailures >= 4) {
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
      `Webhook failed for action ${automation.action.id} in project ${projectId}`,
    );
  }
};
