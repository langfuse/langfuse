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
      const {
        projectId,
        jobConfigurationId,
        jobInputTraceId,
        jobInputObservationId,
      } = params;

      const jobExecution = await prisma.jobExecution.create({
        data: {
          projectId,
          jobConfigurationId,
          jobInputTraceId,
          jobInputObservationId,
          status: params.status as "PENDING",
        },
      });

      return { id: jobExecution.id };
    },

    findExistingJobExecution: async (params) => {
      const { projectId, jobConfigurationId, jobInputObservationId } = params;

      const existing = await prisma.jobExecution.findFirst({
        where: {
          projectId,
          jobConfigurationId,
          jobInputObservationId,
        },
        select: { id: true },
      });

      return existing;
    },

    uploadObservationToS3: async (params) => {
      const path = `evals/${params.projectId}/observations/${params.observationId}.json`;
      const s3Client = getEvalS3StorageClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );

      await s3Client.uploadJson(path, params.data);

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
