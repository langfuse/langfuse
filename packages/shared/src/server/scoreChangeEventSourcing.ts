import { v4 } from "uuid";
import { EntityChangeQueue } from "./redis/entityChangeQueue";
import { type EntityChangeEventType, QueueJobs, QueueName } from "./queues";
import { logger } from "./logger";

type ScoreChangeEvent = Extract<EntityChangeEventType, { entityType: "score" }>;

export const scoreChangeEventSourcing = async (
  event: Omit<ScoreChangeEvent, "entityType">,
) => {
  try {
    await EntityChangeQueue.getInstance()?.add(QueueName.EntityChangeQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: {
        entityType: "score",
        ...event,
      },
      name: QueueJobs.EntityChangeJob,
    });
  } catch (error) {
    logger.error(
      `Failed to queue score change event for score ${event.score.id} in project ${event.projectId}`,
      error,
    );
  }
};
