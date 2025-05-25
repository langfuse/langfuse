import { JobExecutionStatus, prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { processAddToQueue } from "../batchAction/processAddToQueue";

export type ProcessAddToQueueInput = {
  projectId: string;
  traceId: string;
  targetId: string;
  triggerId: string;
  actionId: string;
  executionId: string;
};

export const addObservationToAnnotationQueue = async ({
  projectId,
  traceId,
  targetId,
  triggerId,
  actionId,
  executionId,
}: ProcessAddToQueueInput) => {
  logger.debug(
    `Adding trace ${traceId} to annotation queue ${targetId} in project ${projectId}`,
  );
  await processAddToQueue(projectId, [traceId], targetId);

  await prisma.actionExecution.update({
    where: {
      projectId,
      triggerId,
      actionId,
      id: executionId,
    },
    data: {
      status: JobExecutionStatus.COMPLETED,
      finishedAt: new Date(),
    },
  });

  logger.debug(
    `Added trace ${traceId} to annotation queue ${targetId} in project ${projectId}`,
  );
};
