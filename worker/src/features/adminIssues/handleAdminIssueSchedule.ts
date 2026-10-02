import { randomUUID } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  AdminIssueDetectionQueue,
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";

const PROJECT_BATCH_SIZE = 1000;

export const handleAdminIssueSchedule = async () => {
  const queue = AdminIssueDetectionQueue.getInstance();
  if (!queue) {
    throw new Error("AdminIssueDetectionQueue not initialized");
  }

  let lastProjectId: string | undefined;
  while (true) {
    const projects = await prisma.project.findMany({
      select: { id: true },
      where: {
        deletedAt: null,
        ...(lastProjectId ? { id: { gt: lastProjectId } } : {}),
      },
      orderBy: { id: "asc" },
      take: PROJECT_BATCH_SIZE,
    });
    if (projects.length === 0) return;

    await queue.addBulk(
      projects.map(({ id: projectId }) => ({
        name: QueueJobs.AdminIssueDetectionJob,
        data: {
          id: randomUUID(),
          name: QueueJobs.AdminIssueDetectionJob,
          timestamp: new Date(),
          payload: { projectId },
        } satisfies TQueueJobTypes[QueueName.AdminIssueDetectionQueue],
      })),
    );

    if (projects.length < PROJECT_BATCH_SIZE) return;
    lastProjectId = projects[projects.length - 1].id;
  }
};
