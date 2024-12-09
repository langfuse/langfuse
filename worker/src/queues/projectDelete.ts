import { Job, Processor } from "bullmq";
import {
  deleteObservationsByProjectId,
  deleteScoresByProjectId,
  deleteTracesByProjectId,
  logger,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

export const projectDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.ProjectDelete]>,
): Promise<void> => {
  const { orgId, projectId } = job.data.payload;
  logger.info(`Deleting ${projectId} in org ${orgId}`);

  // Delete project data from ClickHouse first
  await Promise.all([
    deleteTracesByProjectId(projectId),
    deleteObservationsByProjectId(projectId),
    deleteScoresByProjectId(projectId),
  ]);

  // Try to delete traces, observations, and scores from Prisma individually
  // as those will take the longest time and might kill a transaction
  await Promise.all([
    prisma.trace.deleteMany({
      where: {
        projectId,
      },
    }),
    prisma.observation.deleteMany({
      where: {
        projectId,
      },
    }),
    prisma.score.deleteMany({
      where: {
        projectId,
      },
    }),
  ]);

  // Finally, delete the project itself which should delete all related
  // resources due to the referential actions defined via Prisma
  await prisma.project.delete({
    where: {
      id: projectId,
      orgId,
    },
  });

  logger.info(`Deleted ${projectId} in org ${orgId}`);
};
