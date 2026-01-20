import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMAsJudgeExecutionQueue,
  QueueJobs,
  QueueName,
} from "@langfuse/shared/src/server";
import { env } from "../../../env";
import { getEvalS3StorageClient } from "../s3StorageClient";
import { type ObservationEvalSchedulerDeps } from "./types";

/**
 * Creates production dependencies for the observation eval scheduler.
 * Wires up real implementations for Prisma, S3, and BullMQ.
 */
export function createObservationEvalSchedulerDeps(): ObservationEvalSchedulerDeps {
  return {
    createJobExecution: async (params) => {
      const jobExecution = await prisma.jobExecution.create({
        data: {
          projectId: params.projectId,
          jobConfigurationId: params.jobConfigurationId,
          jobInputTraceId: params.jobInputTraceId,
          jobInputObservationId: params.jobInputObservationId,
          status: params.status as "PENDING",
        },
      });

      return { id: jobExecution.id };
    },

    findExistingJobExecution: async (params) => {
      const existing = await prisma.jobExecution.findFirst({
        where: {
          projectId: params.projectId,
          jobConfigurationId: params.jobConfigurationId,
          jobInputObservationId: params.jobInputObservationId,
        },
        select: { id: true },
      });

      return existing;
    },

    uploadObservationToS3: async (params) => {
      const path = `observations/${params.projectId}/${params.observationId}.json`;
      const s3Client = getEvalS3StorageClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );
      await s3Client.uploadJson(path, [params.data as Record<string, unknown>]);

      return path;
    },

    enqueueEvalJob: async (params) => {
      const queue = LLMAsJudgeExecutionQueue.getInstance();
      if (!queue) {
        throw new Error("LLMAsJudgeExecutionQueue is not initialized");
      }

      await queue.add(
        QueueName.LLMAsJudgeExecution,
        {
          name: QueueJobs.LLMAsJudgeExecution,
          id: randomUUID(),
          timestamp: new Date(),
          payload: {
            projectId: params.projectId,
            jobExecutionId: params.jobExecutionId,
            observationS3Path: params.observationS3Path,
          },
        },
        {
          delay: params.delay,
        },
      );
    },
  };
}
