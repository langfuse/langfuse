import { prisma } from "@langfuse/shared/src/db";
import {
  DataRetentionProcessingQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleDataRetentionSchedule = async () => {
  // Get projects with legacy retention configuration
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

  // Get projects with new retention configurations
  const retentionConfigurations = await prisma.retentionConfiguration.findMany({
    select: {
      projectId: true,
      retentionDays: true,
      environments: true,
    },
    where: {
      retentionDays: {
        gt: 0,
      },
    },
  });

  const dataRetentionProcessingQueue =
    DataRetentionProcessingQueue.getInstance();
  if (!dataRetentionProcessingQueue) {
    throw new Error("DataRetentionProcessingQueue not initialized");
  }

  const jobs = [];

  // Add jobs for legacy project-level retention
  jobs.push(
    ...projectsWithRetention.map((project) => ({
      name: QueueJobs.DataRetentionProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.DataRetentionProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId: project.id,
          retention: project.retentionDays,
          environments: undefined, // No environment filtering for legacy configs
        },
      },
    }))
  );

  // Add jobs for environment-specific retention
  jobs.push(
    ...retentionConfigurations.map((config) => ({
      name: QueueJobs.DataRetentionProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.DataRetentionProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId: config.projectId,
          retention: config.retentionDays,
          environments: config.environments,
        },
      },
    }))
  );

  if (jobs.length > 0) {
    await dataRetentionProcessingQueue.addBulk(jobs);
  }
};
