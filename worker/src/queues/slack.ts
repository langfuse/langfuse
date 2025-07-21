import { Processor, Job } from "bullmq";
import {
  QueueName,
  TQueueJobTypes,
  getAutomationById,
  getActionById,
  getConsecutiveAutomationFailures,
  SlackService,
  logger,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  InternalServerError,
  LangfuseNotFoundError,
  ActionExecutionStatus,
  JobConfigState,
} from "@langfuse/shared";
import { SlackActionConfig } from "@langfuse/shared";

/**
 * Queue processor for Slack actions.
 *
 * The job payload mirrors the shape of WebhookQueue jobs and contains
 * project & automation identifiers as well as the original event payload.
 */
export const slackProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.SlackQueue]>,
) => {
  try {
    return await executeSlack(job.data.payload);
  } catch (error) {
    logger.error("Error executing SlackJob", error);
    throw error;
  }
};

export type SlackQueueInput = TQueueJobTypes[QueueName.SlackQueue]["payload"];

/**
 * Execute the Slack action for a queued automation execution.
 */
export const executeSlack = async (input: SlackQueueInput) => {
  const executionStart = new Date();
  const { projectId, automationId, executionId } = input;

  try {
    logger.debug(`Executing Slack action for automation ${automationId}`);

    const automation = await getAutomationById({ projectId, automationId });
    if (!automation) {
      logger.warn(
        `Automation ${automationId} not found for project ${projectId}. We ack the job and will not retry.`,
      );
      return;
    }

    const actionConfig = await getActionById({
      projectId,
      actionId: automation.action.id,
    });

    if (!actionConfig) {
      throw new InternalServerError("Action config not found");
    }

    if (actionConfig.config.type !== "SLACK") {
      throw new InternalServerError("Action config is not a Slack action");
    }

    const slackConfig = actionConfig.config as SlackActionConfig;

    // Build message blocks – either from template or simple fallback
    let blocks: any[] = [];
    if (slackConfig.messageTemplate) {
      try {
        blocks = JSON.parse(slackConfig.messageTemplate);
      } catch {
        logger.warn(
          `Invalid Slack messageTemplate JSON for action ${automation.action.id}. Falling back to default template`,
        );
      }
    }

    if (blocks.length === 0) {
      // Fallback simple template
      const { action, type, prompt } = input.payload;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Langfuse* • ${type} *${action}*\nPrompt *${prompt.name}* (v${prompt.version})`,
          },
        },
      ];
    }

    // Get Slack WebClient for project via centralized SlackService
    const client = await SlackService.getWebClientForProject(projectId);

    // Send message
    const sendResult = await SlackService.sendMessage({
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

    logger.debug(
      `Slack action executed successfully for action ${automation.action.id}`,
    );
  } catch (error) {
    logger.error("Error executing Slack action", error);

    // Attempt to fetch automation again for proper failure handling
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
        `Retrying BullMQ for Slack job for action ${automation.action.id}`,
      );
      throw error; // Trigger BullMQ retry
    }

    // Update execution status to error
    await prisma.$transaction(async (tx) => {
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

      // Count consecutive failures and potentially disable trigger
      const consecutiveFailures = await getConsecutiveAutomationFailures({
        automationId,
        projectId,
      });

      logger.info(
        `Consecutive Slack failures: ${consecutiveFailures} for trigger ${automation.trigger.id} in project ${projectId}`,
      );

      if (consecutiveFailures >= 4) {
        await tx.trigger.update({
          where: { id: automation.trigger.id, projectId },
          data: { status: JobConfigState.INACTIVE },
        });
        logger.warn(
          `Automation ${automation.trigger.id} disabled after ${consecutiveFailures} consecutive Slack failures in project ${projectId}`,
        );
      }
    });
  }
};
