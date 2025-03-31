import { Job, Processor } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";

import { processClickhouseScoreDelete } from "../features/scores/processClickhouseScoreDelete";

export const scoreDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.ScoreDelete]>,
): Promise<void> => {
  const { scoreIds, projectId } = job.data.payload;
  await processClickhouseScoreDelete(projectId, scoreIds);
};
