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
  InMemoryFilterService,
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
    logger.info(
      `Processing prompt version change event for prompt ${event.promptId} for project ${event.projectId}`,
      { event: JSON.stringify(event, null, 2) },
    );

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

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Create a unified data object that includes both prompt data and the action
        const eventData = {
          ...event.prompt,
          action: event.action,
        };

        // Create a field mapper for all data including action
        const fieldMapper = (data: typeof eventData, column: string) => {
          switch (column) {
            case "action":
              return data.action;
            case "Name":
              return data.name;
            default:
              return undefined;
          }
        };

        // Use InMemoryFilterService for all filtering including actions
        const eventMatches = InMemoryFilterService.evaluateFilter(
          eventData,
          trigger.filter,
          fieldMapper,
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
          trigger.actionIds.map(async (actionId) =>
            executeWebhookAction({
              promptData: {
                ...event.prompt,
                resolutionGraph: null,
              },
              action: event.action,
              triggerId: trigger.id,
              actionId,
              projectId: event.projectId,
            }),
          ),
        );
      } catch (error) {
        logger.error(
          `Error processing trigger ${trigger.id} for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
        );
        // Continue processing other triggers instead of failing the entire operation
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process prompt version change event for prompt ${event.promptId} for project ${event.projectId}: ${error}`,
    );
    throw error; // Re-throw to trigger retry mechanism
  }
};

/**
 * Execute a webhook action for a prompt version change
 */
async function executeWebhookAction({
  promptData,
  action,
  triggerId,
  actionId,
  projectId,
}: {
  promptData: PromptResult;
  action: string;
  triggerId: string;
  actionId: string;
  projectId: string;
}): Promise<void> {
  // Get action configuration
  const actionConfig = await getActionById({
    projectId,
    actionId,
  });

  if (!actionConfig) {
    throw new Error(`Action ${actionId} not found`);
  }

  const automations = await getAutomations({
    projectId,
    actionId,
  });

  if (automations.length !== 1) {
    throw new InternalServerError(
      `Expected 1 automation for action ${actionId}, got ${automations.length}`,
    );
  }

  const executionId = v4();

  // Create execution record
  const execution = await prisma.automationExecution.create({
    data: {
      id: executionId,
      projectId,
      automationId: automations[0].id,
      triggerId: triggerId,
      actionId: actionId,
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
    `Created action execution ${execution.id} for project ${projectId} and trigger ${triggerId} and action ${actionId}`,
  );

  // Queue webhook
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: v4(),
    payload: {
      projectId,
      automationId: automations[0].id,
      executionId: executionId,
      payload: {
        action: action as TriggerEventAction,
        type: "prompt-version",
        prompt: {
          ...promptData,
          prompt: jsonSchemaNullable.parse(promptData.prompt),
          config: jsonSchemaNullable.parse(promptData.config),
        },
      },
    },
    name: QueueJobs.WebhookJob,
  });
}
