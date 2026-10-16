import { JobConfigState, TriggerEventSource } from "@langfuse/shared";
import {
  AutomationExecutionQueue,
  getTriggerConfigurations,
  logger,
  matchesTriggerFilter,
  QueueJobs,
  QueueName,
  type ScoreChangeEventType,
} from "@langfuse/shared/src/server";
import { v4, v5 } from "uuid";

export const scoreProcessor = async (event: ScoreChangeEventType) => {
  const observationId = event.score.observationId;
  if (!observationId) {
    return;
  }

  const triggers = await getTriggerConfigurations({
    projectId: event.projectId,
    eventSource: TriggerEventSource.Score,
    status: JobConfigState.ACTIVE,
  });
  const failures: unknown[] = [];

  for (const trigger of triggers) {
    if (
      !matchesTriggerFilter(
        {
          name: event.score.name,
          dataType: event.score.dataType,
          value: event.score.value,
          stringValue: event.score.stringValue,
          longStringValue: event.score.longStringValue,
          action: event.action,
        },
        trigger,
      )
    ) {
      continue;
    }

    const automation = trigger.automations[0];
    const actionId = trigger.actionIds[0];
    if (
      trigger.automations.length !== 1 ||
      trigger.actionIds.length !== 1 ||
      !automation ||
      !actionId
    ) {
      logger.error(`Score trigger ${trigger.id} must have exactly one action`);
      continue;
    }

    const jobId = v5(`${automation.id}:${event.eventId}`, v5.URL);

    try {
      const queue = AutomationExecutionQueue.getInstance();
      if (!queue) {
        throw new Error("Automation execution queue is not available");
      }

      await queue.add(
        QueueName.AutomationExecutionQueue,
        {
          timestamp: new Date(),
          id: v4(),
          name: QueueJobs.AutomationExecutionJob,
          payload: {
            executionId: jobId,
            projectId: event.projectId,
            automationId: automation.id,
            triggerId: trigger.id,
            actionId,
            sourceId: event.eventId,
            input: {
              type: "score",
              action: event.action,
              score: {
                ...event.score,
                stringValue: event.score.stringValue ?? null,
                longStringValue: event.score.longStringValue ?? null,
                observationId,
              },
            },
          },
        },
        { jobId },
      );
    } catch (error) {
      failures.push(error);
      logger.error(
        `Failed to queue score trigger ${trigger.id} for score ${event.score.id}`,
        error,
      );
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to process score automations");
  }
};
