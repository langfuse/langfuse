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
  const projectsWithSandboxCleanup = await prisma.inAppAgentConversation.findMany({
    where: {
      AND: [
        {
          OR: [
            { providerSessionId: { not: null } },
            { sandboxSnapshotKey: { not: null } },
            { sandboxExpiresAt: { not: null } },
            { sandboxProvider: { not: null } },
          ],
        },
        {
          OR: [{ createdByUserId: null }, { deletedAt: { not: null } }],
        },
      ],
    },
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const queuedProjects = new Map(
    projectsWithRetention.map((project) => [project.id, project.retentionDays]),
  );

  for (const project of projectsWithSandboxCleanup) {
    queuedProjects.set(project.projectId, queuedProjects.get(project.projectId) ?? null);
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
