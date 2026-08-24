import {
  type TriggerEventAction,
  jsonSchemaNullable,
  InternalServerError,
} from "@langfuse/shared";
import {
  getTriggerConfigurations,
  getActionById,
  logger,
  WebhookQueue,
  QueueName,
  QueueJobs,
  matchesTriggerFilter,
  type PromptResult,
  getAutomations,
  EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { TriggerEventSource } from "@langfuse/shared";
import { ActionExecutionStatus, JobConfigState } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

/**
 * Process prompt change events with in-memory filtering
 */
export const promptVersionProcessor = async (
  event: EntityChangeEventType,
): Promise<void> => {
  try {
    if (logger.isLevelEnabled("debug")) {
      logger.debug(
        `Processing prompt version change event for prompt ${event.promptId} for project ${event.projectId}`,
        { event: JSON.stringify(event, null, 2) },
      );
    }

    // Get active prompt triggers
    const triggers = await getTriggerConfigurations({
      projectId: event.projectId,
      eventSource: TriggerEventSource.Prompt,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active prompt triggers`, {
      promptId: event.promptId,
      projectId: event.projectId,
      action: event.action,
    });

    // Process each trigger. Collect failures instead of swallowing them so
    // that infra failures (e.g. a dropped webhook enqueue) still surface as
    // a job failure and get retried by BullMQ, while a bad trigger doesn't
    // block the remaining ones from being processed.
    const triggerErrors: unknown[] = [];
    for (const trigger of triggers) {
      try {
        const eventMatches = matchesTriggerFilter(
          { Name: event.prompt.name, action: event.action },
          trigger,
        );

        if (!eventMatches) {
          logger.debug(`Event doesn't match trigger ${trigger.id} filters`, {
            promptId: event.promptId,
            projectId: event.projectId,
            action: event.action,
          });
          continue;
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`, {
          promptId: event.promptId,
          projectId: event.projectId,
          action: event.action,
        });

        if (trigger.actionIds.length !== 1) {
          logger.debug(
            `Trigger ${trigger.id} for project ${trigger.projectId} has multiple or no actions. This is not expected`,
          );
          throw new InternalServerError(
            `Trigger ${trigger.id} for project ${trigger.projectId} has multiple or no actions. This is not expected`,
          );
        }

        await Promise.all(
          trigger.actionIds.map(async (actionId) => {
            const actionConfig = await getActionById({
              projectId: event.projectId,
              actionId,
            });

            if (!actionConfig) {
              logger.error(`Action ${actionId} not found`);
              return;
            }

            await enqueueAutomationAction({
              promptData: {
                ...event.prompt,
                resolutionGraph: null,
              },
              action: event.action,
              triggerId: trigger.id,
              actionId,
              projectId: event.projectId,
              user: event.user,
            });
          }),
        );
      } catch (error) {
        logger.error(
          `Error processing trigger ${trigger.id} for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
        );
        // Continue processing other triggers instead of failing the entire operation
        triggerErrors.push(error);
      }
    }

    if (triggerErrors.length > 0) {
      throw new AggregateError(
        triggerErrors,
        `Failed to process ${triggerErrors.length} of ${triggers.length} trigger(s) for prompt ${event.promptId} for project ${event.projectId}`,
      );
    }
  } catch (error) {
    logger.error(
      `Failed to process prompt version change event for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
    );
    throw error; // Re-throw to trigger retry mechanism
  }
};

/**
 * Enqueue an automation action for a prompt version change.
 * Handles both webhook and Slack actions by enqueueing to the same webhook queue.
 */
async function enqueueAutomationAction({
  promptData,
  action,
  triggerId,
  actionId,
  projectId,
  user,
}: {
  promptData: PromptResult;
  action: string;
  triggerId: string;
  actionId: string;
  projectId: string;
  user?: { id: string; name: string | null; email: string | null };
}): Promise<void> {
  // Get automations for this action
  const automations = await getAutomations({
    projectId,
    actionId,
  });

  if (automations.length !== 1) {
    throw new InternalServerError(
      `Expected 1 automation for action ${actionId}, got ${automations.length}`,
    );
  }

  // Guard against duplicate deliveries when BullMQ retries this job after a
  // partial failure: skip triggers that already have a non-errored execution
  // for this exact source instead of creating a second one and re-enqueuing.
  const existingExecution = await prisma.automationExecution.findFirst({
    where: {
      projectId,
      triggerId,
      actionId,
      sourceId: promptData.id,
      status: { not: ActionExecutionStatus.ERROR },
    },
  });

  if (existingExecution) {
    logger.debug(
      `Automation execution ${existingExecution.id} already exists for trigger ${triggerId}, action ${actionId}, and source ${promptData.id}; skipping duplicate enqueue`,
    );
    return;
  }

  const executionId = v4();

  // Create execution record
  await prisma.automationExecution.create({
    data: {
      id: executionId,
      projectId,
      automationId: automations[0].id,
      triggerId,
      actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: promptData.id,
      input: {
        promptName: promptData.name,
        promptVersion: promptData.version,
        promptId: promptData.id,
        automationId: automations[0].id,
        type: "prompt-version",
      },
    },
  });

  logger.debug(
    `Created automation execution ${executionId} for project ${projectId} and action ${actionId}`,
  );

  // Queue to webhook processor (handles both webhook and Slack actions)
  try {
    const webhookQueue = WebhookQueue.getInstance();
    if (!webhookQueue) {
      throw new Error("Webhook queue is unavailable");
    }

    await webhookQueue.add(QueueName.WebhookQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: {
        projectId,
        automationId: automations[0].id,
        executionId,
        payload: {
          action: action as TriggerEventAction,
          type: "prompt-version",
          prompt: {
            ...promptData,
            prompt: jsonSchemaNullable.parse(promptData.prompt),
            config: jsonSchemaNullable.parse(promptData.config),
          },
          ...(user ? { user } : {}),
        },
      },
      name: QueueJobs.WebhookJob,
    });
  } catch (error) {
    // The execution row was already created as PENDING above. If enqueueing
    // fails, mark it as ERROR so it doesn't stay stuck PENDING forever, and
    // rethrow so the caller's retry mechanism applies.
    await prisma.automationExecution.update({
      where: { id: executionId, projectId },
      data: {
        status: ActionExecutionStatus.ERROR,
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}
