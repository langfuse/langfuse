import {
  type TriggerEventAction,
  InternalServerError,
  type TraceDomain,
  type ObservationLevelType,
} from "@langfuse/shared";
import {
  getTriggerConfigurations,
  getActionById,
  logger,
  WebhookQueue,
  QueueName,
  QueueJobs,
  InMemoryFilterService,
  getAutomations,
  type EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { TriggerEventSource } from "@langfuse/shared";
import { ActionExecutionStatus, JobConfigState } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

/**
 * Extract the trace entity change event type from the discriminated union.
 * This ensures type safety when accessing trace-specific fields.
 */
type TraceEntityChangeEvent = Extract<
  EntityChangeEventType,
  { entityType: "trace" }
>;

/**
 * Process trace change events with in-memory filtering.
 * Evaluates active trace triggers and enqueues matching automation actions.
 */
export const traceProcessor = async (
  event: TraceEntityChangeEvent,
): Promise<void> => {
  try {
    logger.info(
      `Processing trace change event for trace ${event.traceId} in project ${event.projectId}`,
      { event: JSON.stringify(event, null, 2) },
    );

    // Get active trace triggers for the project
    const triggers = await getTriggerConfigurations({
      projectId: event.projectId,
      eventSource: TriggerEventSource.Trace,
      status: JobConfigState.ACTIVE,
    });

    logger.debug(`Found ${triggers.length} active trace triggers`, {
      traceId: event.traceId,
      projectId: event.projectId,
      action: event.action,
    });

    // Process each trigger
    for (const trigger of triggers) {
      try {
        // Build unified data object that includes trace data, action, and observation context
        const eventData = {
          ...event.trace,
          action: event.action,
          // Observation-level context (present when triggered by an observation event)
          level: event.observationLevel ?? null,
          observationId: event.observationId ?? null,
        };

        // Map filter columns to trace and observation data fields.
        // NOTE: The column values stored in the DB match the display `name`
        // from ColumnDefinition (e.g. "Observation Level"), not the `id`.
        const fieldMapper = (data: typeof eventData, column: string) => {
          switch (column) {
            case "action":
              return data.action;
            case "Name":
              return data.name;
            case "Tags":
              return data.tags;
            case "Environment":
              return data.environment;
            case "User ID":
              return data.userId;
            case "Release":
              return data.release;
            case "Version":
              return data.version;
            case "Observation Level":
              return data.level;
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
            traceId: event.traceId,
            projectId: event.projectId,
            action: event.action,
          });
          continue;
        }

        logger.debug(`Trigger ${trigger.id} matches, executing actions`, {
          traceId: event.traceId,
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

            await enqueueTraceAutomationAction({
              traceData: event.trace,
              action: event.action,
              triggerId: trigger.id,
              actionId,
              projectId: event.projectId,
              observationLevel: event.observationLevel,
              observationId: event.observationId,
            });
          }),
        );
      } catch (error) {
        logger.error(
          `Error processing trigger ${trigger.id} for trace ${event.traceId} in project ${event.projectId}: ${error}`,
        );
        // Continue processing other triggers instead of failing the entire operation
      }
    }
  } catch (error) {
    logger.error(
      `Failed to process trace change event for trace ${event.traceId} in project ${event.projectId}: ${error}`,
    );
    throw error; // Re-throw to trigger retry mechanism
  }
};

/**
 * Enqueue an automation action for a trace change.
 * Handles both webhook and Slack actions by enqueueing to the shared webhook queue.
 * Passes through optional observation-level context for error-triggered notifications.
 */
async function enqueueTraceAutomationAction({
  traceData,
  action,
  triggerId,
  actionId,
  projectId,
  observationLevel,
  observationId,
}: {
  traceData: TraceDomain;
  action: string;
  triggerId: string;
  actionId: string;
  projectId: string;
  observationLevel?: string;
  observationId?: string;
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
      sourceId: traceData.id,
      input: {
        traceName: traceData.name,
        traceId: traceData.id,
        automationId: automations[0].id,
        type: "trace",
        ...(observationLevel && { observationLevel }),
        ...(observationId && { observationId }),
      },
    },
  });

  logger.debug(
    `Created automation execution ${executionId} for project ${projectId} and action ${actionId}`,
  );

  // Queue to webhook processor (handles both webhook and Slack actions)
  await WebhookQueue.getInstance()?.add(QueueName.WebhookQueue, {
    timestamp: new Date(),
    id: v4(),
    payload: {
      projectId,
      automationId: automations[0].id,
      executionId,
      payload: {
        action: action as TriggerEventAction,
        type: "trace" as const,
        trace: traceData,
        // Forward observation context for Slack message rendering
        ...(observationLevel && {
          observationLevel: observationLevel as ObservationLevelType,
        }),
        ...(observationId && { observationId }),
      },
    },
    name: QueueJobs.WebhookJob,
  });
}
