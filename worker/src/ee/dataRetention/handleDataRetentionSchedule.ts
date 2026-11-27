import { prisma } from "@langfuse/shared/src/db";
import {
  DataRetentionProcessingQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { isEnterpriseLicenseAvailable } from "@langfuse/shared/src/server/ee/licenseCheck";
import { randomUUID } from "crypto";

export const handleDataRetentionSchedule = async () => {
  // Data retention is an enterprise feature. Without a license the setting
  // cannot be viewed or changed, so stored policies must not be enforced
  // either: a deployment that loses its license would otherwise keep deleting
  // data under a policy its operators can no longer reach.
  if (!isEnterpriseLicenseAvailable()) {
    return;
  }

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
