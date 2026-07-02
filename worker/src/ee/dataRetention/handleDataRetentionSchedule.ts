import { prisma } from "@langfuse/shared/src/db";
import {
  DataRetentionProcessingQueue,
  QueueJobs,
  getSandboxCleanupWhere,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleDataRetentionSchedule = async () => {
  const now = new Date();
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
  const projectsWithSandboxCleanup =
    await prisma.inAppAgentConversation.findMany({
      where: getSandboxCleanupWhere({ now }),
      select: { projectId: true },
      distinct: ["projectId"],
    });
  const queuedProjects = new Map(
    projectsWithRetention.map((project) => [project.id, project.retentionDays]),
  );

  for (const project of projectsWithSandboxCleanup) {
    queuedProjects.set(
      project.projectId,
      queuedProjects.get(project.projectId) ?? null,
    );
  }

  const dataRetentionProcessingQueue =
    DataRetentionProcessingQueue.getInstance();
  if (!dataRetentionProcessingQueue) {
    throw new Error("DataRetentionProcessingQueue not initialized");
  }

  await dataRetentionProcessingQueue.addBulk(
    Array.from(queuedProjects.entries()).map(([projectId, retention]) => ({
      name: QueueJobs.DataRetentionProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.DataRetentionProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId,
          retention,
        },
      },
    })),
  );
};
