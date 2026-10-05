import {
  ActionExecutionStatus,
  JobConfigState,
  TriggerEventSource,
} from "@langfuse/shared";
import {
  getActionById,
  getTriggerConfigurations,
  logger,
  matchesTriggerFilter,
  type EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { v5 } from "uuid";
import { processAddObservationsToQueue } from "../batchAction/processAddToQueue";

type ScoreChangeEvent = Extract<EntityChangeEventType, { entityType: "score" }>;

export const scoreProcessor = async (
  event: ScoreChangeEvent,
): Promise<void> => {
  if (!event.score.observationId) {
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

    const executionId = v5(`${automation.id}:${event.eventId}`, v5.URL);

    try {
      const existingExecution = await prisma.automationExecution.findUnique({
        where: { id: executionId },
        select: { status: true },
      });
      if (existingExecution?.status === ActionExecutionStatus.COMPLETED) {
        continue;
      }

      const action = await getActionById({
        projectId: event.projectId,
        actionId,
      });
      if (!action || action.config.type !== "ANNOTATION_QUEUE") {
        throw new Error(
          `Score automation ${automation.id} does not have an annotation queue action`,
        );
      }

      await prisma.automationExecution.upsert({
        where: { id: executionId },
        create: {
          id: executionId,
          projectId: event.projectId,
          automationId: automation.id,
          triggerId: trigger.id,
          actionId,
          status: ActionExecutionStatus.PENDING,
          sourceId: event.eventId,
          input: {
            type: "score",
            action: event.action,
            score: {
              ...event.score,
              stringValue: event.score.stringValue ?? null,
              longStringValue: event.score.longStringValue ?? null,
              observationId: event.score.observationId,
            },
          },
          startedAt: new Date(),
        },
        update: {
          status: ActionExecutionStatus.PENDING,
          error: null,
          finishedAt: null,
          startedAt: new Date(),
        },
      });

      await Promise.all(
        action.config.queueIds.map((queueId) =>
          processAddObservationsToQueue(
            event.projectId,
            [event.score.observationId!],
            queueId,
          ),
        ),
      );

      await prisma.automationExecution.update({
        where: { id: executionId },
        data: {
          status: ActionExecutionStatus.COMPLETED,
          output: {
            queueIds: action.config.queueIds,
            observationId: event.score.observationId,
          },
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      failures.push(error);
      await prisma.automationExecution
        .update({
          where: { id: executionId },
          data: {
            status: ActionExecutionStatus.ERROR,
            error: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
      logger.error(
        `Failed to process score trigger ${trigger.id} for score ${event.score.id}`,
        error,
      );
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to process score automations");
  }
};
