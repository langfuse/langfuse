import { ActionExecutionStatus } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { UnrecoverableError } from "bullmq";
import {
  getActionById,
  logger,
  type AutomationExecutionQueueEventType,
} from "@langfuse/shared/src/server";
import { processAddObservationsToQueue } from "../batchAction/processAddToQueue";

export const executeAutomationAction = async (
  event: AutomationExecutionQueueEventType,
) => {
  const startedAt = new Date();

  await prisma.automationExecution.upsert({
    where: { id: event.executionId },
    create: {
      id: event.executionId,
      projectId: event.projectId,
      automationId: event.automationId,
      triggerId: event.triggerId,
      actionId: event.actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: event.sourceId,
      input: event.input,
      startedAt,
    },
    update: {
      projectId: event.projectId,
      automationId: event.automationId,
      triggerId: event.triggerId,
      actionId: event.actionId,
      status: ActionExecutionStatus.PENDING,
      sourceId: event.sourceId,
      input: event.input,
      output: Prisma.DbNull,
      error: null,
      startedAt,
      finishedAt: null,
    },
  });

  try {
    const action = await getActionById({
      projectId: event.projectId,
      actionId: event.actionId,
    });
    if (!action || action.config.type !== "ANNOTATION_QUEUE") {
      throw new Error(
        `Automation ${event.automationId} does not have an annotation queue action`,
      );
    }

    const existingQueues = await prisma.annotationQueue.findMany({
      where: {
        projectId: event.projectId,
        id: { in: action.config.queueIds },
      },
      select: { id: true },
    });
    const existingQueueIds = new Set(existingQueues.map((queue) => queue.id));
    const queueIds = action.config.queueIds.filter((queueId) =>
      existingQueueIds.has(queueId),
    );
    const missingQueueIds = action.config.queueIds.filter(
      (queueId) => !existingQueueIds.has(queueId),
    );

    if (queueIds.length === 0) {
      throw new UnrecoverableError(
        `Automation ${event.automationId} has no existing annotation queue destinations`,
      );
    }
    if (missingQueueIds.length > 0) {
      logger.warn(
        `Skipping missing annotation queues for automation ${event.automationId}`,
        { projectId: event.projectId, missingQueueIds },
      );
    }

    await Promise.all(
      queueIds.map((queueId) =>
        processAddObservationsToQueue(
          event.projectId,
          [event.input.score.observationId],
          queueId,
        ),
      ),
    );

    await prisma.automationExecution.update({
      where: { id: event.executionId },
      data: {
        status: ActionExecutionStatus.COMPLETED,
        output: {
          queueIds,
          missingQueueIds,
          observationId: event.input.score.observationId,
        },
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.automationExecution
      .update({
        where: { id: event.executionId },
        data: {
          status: ActionExecutionStatus.ERROR,
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
    logger.error(
      `Failed to execute automation ${event.automationId} for source ${event.sourceId}`,
      error,
    );
    throw error;
  }
};
