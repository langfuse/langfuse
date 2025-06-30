import {
  type TriggerEventAction,
  type Prompt,
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
} from "@langfuse/shared/src/server";
import { TriggerEventSource } from "@langfuse/shared";
import { ActionExecutionStatus, JobConfigState } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

/**
 * Helper function to check if action filter matches the event action
 */
function actionMatches(action: string, triggerFilters: any[]): boolean {
  const actionFilter = triggerFilters.find((f) => f.column === "action");
  if (!actionFilter) return true;

  const filterValue = actionFilter.value as string[];
  const operator = actionFilter.operator;

  switch (operator) {
    case "any of":
      return Array.isArray(filterValue) ? filterValue.includes(action) : false;
    case "none of":
      return Array.isArray(filterValue) ? !filterValue.includes(action) : true;
    case "equals":
      return filterValue[0] === action;
    case "not equals":
      return filterValue[0] !== action;
    default:
      return false;
  }
}

/**
 * Process prompt change events directly with in-memory filtering
 */
export const promptChangeEventSourcing = async (
  promptData: Prompt,
  action: TriggerEventAction,
) => {
  try {
    // Get active prompt triggers
    const triggers = await getTriggerConfigurations({
      projectId: promptData.projectId,
      eventSource: TriggerEventSource.Prompt,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active prompt triggers`, {
      promptId: promptData.id,
    });

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Check if action matches
        if (!actionMatches(action, trigger.filter)) {
          logger.debug(`Action ${action} doesn't match trigger ${trigger.id}`, {
            promptId: promptData.id,
          });
          continue;
        }

        // Check if prompt matches remaining filters using in-memory filtering
        const nonActionFilters = trigger.filter.filter(
          (f) => f.column !== "action",
        );

        // Create a field mapper for prompt data
        const fieldMapper = (data: Prompt, column: string) => {
          switch (column) {
            case "name":
              return data.name;
            case "version":
              return data.version;
            case "tags":
              return data.tags;
            case "labels":
              return data.labels;
            case "type":
              return data.type;
            case "createdBy":
              return data.createdBy;
            case "createdAt":
              return data.createdAt;
            case "updatedAt":
              return data.updatedAt;
            case "isActive":
              return data.isActive;
            default:
              return undefined;
          }
        };

        const promptMatches = InMemoryFilterService.evaluateFilter(
          promptData,
          nonActionFilters,
          fieldMapper,
        );

        if (!promptMatches) {
          logger.debug(`Prompt doesn't match trigger ${trigger.id} filters`, {
            promptId: promptData.id,
          });
          continue;
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`, {
          promptId: promptData.id,
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
          trigger.actionIds.map((actionId) =>
            executeWebhookAction({
              promptData,
              action,
              triggerId: trigger.id,
              actionId,
            }),
          ),
        );
      } catch (error) {
        logger.error(
          `Error processing trigger ${trigger.id} for prompt ${promptData.id} for project ${promptData.projectId}: ${error}`,
        );
        // Continue processing other triggers instead of failing the entire operation
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process prompt version change event for prompt ${promptData.id} for project ${promptData.projectId}: ${error}`,
    );
    // Don't throw error to avoid breaking the main prompt operation
    // Automation failures should not prevent prompt operations from succeeding
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
}: {
  promptData: Prompt;
  action: string;
  triggerId: string;
  actionId: string;
}): Promise<void> {
  // Get action configuration
  const actionConfig = await getActionById({
    projectId: promptData.projectId,
    actionId,
  });

  if (!actionConfig) {
    throw new Error(`Action ${actionId} not found`);
  }

  const executionId = v4();
  const eventId = `evt_${v4()}`;

  // Create execution record
  const execution = await prisma.actionExecution.create({
    data: {
      id: executionId,
      projectId: promptData.projectId,
      triggerId: triggerId,
      actionId: actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: promptData.id,
      input: {
        promptName: promptData.name,
        promptVersion: promptData.version,
        promptId: promptData.id,
        action: action,
        type: "prompt",
      },
    },
  });

  logger.debug(
    `Created action execution ${execution.id} for project ${promptData.projectId} and trigger ${triggerId} and action ${actionId}`,
  );

  // Queue webhook
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: v4(),
    payload: {
      projectId: actionConfig.projectId,
      actionId: actionConfig.id,
      triggerId: triggerId,
      executionId: executionId,
      eventId: eventId,
      payload: {
        action: action as TriggerEventAction,
        type: "prompt",
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
