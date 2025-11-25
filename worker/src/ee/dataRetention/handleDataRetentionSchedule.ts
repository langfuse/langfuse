import { prisma } from "@langfuse/shared/src/db";
import {
  DataRetentionProcessingQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleDataRetentionSchedule = async () => {
  const projectsWithRetention = await prisma.project.findMany({
    select: {
      id: true,
      retentionDays: true,
    },
    where: {
      retentionDays: {
        gt: 0, // Select all projects with a non-zero/non-null retention
      },
    },
  });

  const dataRetentionProcessingQueue =
    DataRetentionProcessingQueue.getInstance();
  if (!dataRetentionProcessingQueue) {
    throw new Error("DataRetentionProcessingQueue not initialized");
  }

  await dataRetentionProcessingQueue.addBulk(
    projectsWithRetention.map((project) => ({
      name: QueueJobs.DataRetentionProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.DataRetentionProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId: project.id,
          retention: project.retentionDays,
        },
      },
    })),
  );
};
