import { Job, Processor } from "bullmq";
import { backOff } from "exponential-backoff";
import {
  ActionExecutionStatus,
  JobConfigState,
} from "../../../prisma/generated/types";
import { PromptWebhookOutboundSchema } from "../../domain";
import { prisma } from "../../db";
import { recordIncrement } from "../instrumentation";
import { TQueueJobTypes, QueueName, WebhookInput } from "../queues";
import {
  getActionByIdWithSecrets,
  getConsecutiveAutomationFailures,
} from "../repositories";
import { PromptService } from "../services/PromptService";
import { redis } from "../redis/redis";
import { logger } from "..";
import { createSignatureHeader } from "../../encryption/signature";
import { decrypt } from "../../encryption";

export const webhookProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.WebhookQueue]>,
) => {
  try {
    return await executeWebhook(job.data.payload, job.attemptsMade + 1);
  } catch (error) {
    logger.error("Error executing WebhookJob", error);
    throw error;
  }
};

// TODO: Webhook outgoing API versioning
export const executeWebhook = async (input: WebhookInput, attempt: number) => {
  const executionStart = new Date();

  const { projectId, actionId, triggerId, executionId } = input;
  let httpStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    logger.debug(
      `Executing webhook for action ${actionId} and execution ${executionId}`,
    );

    const actionConfig = await getActionByIdWithSecrets({
      projectId,
      actionId,
    });

    if (!actionConfig) {
      throw new Error("Action config not found");
    }

    if (actionConfig.config.type !== "WEBHOOK") {
      throw new Error("Action config is not a webhook");
    }

    const promptService = new PromptService(prisma, redis, recordIncrement);

    const prompt = await promptService.getPrompt({
      projectId,
      promptName: input.payload.promptName,
      version: input.payload.promptVersion,
      label: undefined,
    });

    // TypeScript now knows actionConfig.config is WebhookActionConfig
    const webhookConfig = actionConfig.config;

    // Validate that the webhook URL uses HTTPS protocol for security
    try {
      const webhookUrl = new URL(webhookConfig.url);
      if (webhookUrl.protocol !== "https:") {
        throw new Error(
          `Webhook URL must use HTTPS protocol for security. Received: ${webhookUrl.protocol}`,
        );
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid webhook URL: ${webhookConfig.url}`);
      }
      throw error;
    }

    // Prepare webhook payload
    const webhookPayload = JSON.stringify({
      ...PromptWebhookOutboundSchema.parse({
        id: input.eventId,
        timestamp: new Date(),
        type: input.payload.type,
        action: input.payload.action,
        prompt,
      }),
    });

    // Prepare headers with signature if secret exists
    const requestHeaders = { ...webhookConfig.headers };
    if (webhookConfig.secretKey) {
      try {
        const decryptedSecret = decrypt(webhookConfig.secretKey);
        logger.info(`Decrypted secret: ${decryptedSecret}`);
        const signature = createSignatureHeader(
          webhookPayload,
          decryptedSecret,
        );
        requestHeaders["Langfuse-Signature"] = signature;
      } catch (error) {
        logger.error(
          "Failed to decrypt webhook secret or generate signature",
          error,
        );
        throw new Error("Failed to generate webhook signature");
      }
    }

    await backOff(
      async () => {
        const res = await fetch(webhookConfig.url, {
          method: "POST",
          body: webhookPayload,
          headers: requestHeaders,
        });

        httpStatus = res.status;
        responseBody = await res.text();

        if (res.status !== 200) {
          logger.error(
            `Webhook for project ${projectId} failed with status ${res.status}`,
          );
          throw new Error(`Webhook failed with status ${res.status}`);
        }
      },
      {
        numOfAttempts: 4,
      },
    );

    // Update action execution status on success
    await prisma.actionExecution.update({
      where: {
        projectId,
        triggerId,
        actionId,
        id: executionId,
      },
      data: {
        status: ActionExecutionStatus.COMPLETED,
        startedAt: executionStart,
        finishedAt: new Date(),
        output: {
          httpStatus,
          responseBody: responseBody?.substring(0, 1000), // Limit response body size
        },
      },
    });

    logger.debug(`Webhook executed successfully for action ${actionId}`);
  } catch (error) {
    logger.error("Error executing webhook", error);

    // Update action execution status and check if we should disable trigger
    await prisma.$transaction(async (tx) => {
      // Update execution status
      await tx.actionExecution.update({
        where: {
          projectId,
          triggerId,
          actionId,
          id: executionId,
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
        triggerId,
        actionId,
        projectId,
      });

      logger.info(
        `Consecutive failures: ${consecutiveFailures} for trigger ${triggerId} in project ${projectId}`,
      );

      // Check if trigger should be disabled (>= 5 consecutive failures)
      if (consecutiveFailures >= 5) {
        await tx.trigger.update({
          where: { id: triggerId, projectId },
          data: { status: JobConfigState.INACTIVE },
        });

        logger.warn(
          `Automation ${triggerId} disabled after ${consecutiveFailures} consecutive failures in project ${projectId}`,
        );
      }
    });

    logger.debug(`Webhook failed for action ${actionId}`);
  }
};
