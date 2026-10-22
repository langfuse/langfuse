import { v4 } from "uuid";
import { ScoreChangeQueue } from "./redis/scoreChangeQueue";
import { type ScoreChangeEventType, QueueJobs, QueueName } from "./queues";
import { logger } from "./logger";

export const scoreChangeEventSourcing = async (event: ScoreChangeEventType) => {
  try {
    const queue = ScoreChangeQueue.getInstance();
    if (!queue) {
      throw new Error("Score change queue is not available");
    }
    await queue.add(QueueName.ScoreChangeQueue, {
      timestamp: new Date(),
      id: v4(),
      payload: event,
      name: QueueJobs.ScoreChangeJob,
    });
  } catch (error) {
    logger.error(
      `Failed to queue score change event for score ${event.score.id} in project ${event.projectId}`,
      error,
    );
    throw error;
  }
};
