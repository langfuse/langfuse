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
    upsertJobExecution: async (params) => {
      const {
        id,
        projectId,
        jobConfigurationId,
        jobInputTraceId,
        jobInputObservationId,
        jobTemplateId,
        status,
      } = params;

      const jobExecution = await prisma.jobExecution.upsert({
        where: {
          id,
          projectId,
        },
        create: {
          id,
          projectId,
          jobConfigurationId,
          jobInputTraceId,
          jobInputObservationId,
          jobTemplateId,
          status,
        },
        update: {
          status,
        },
      });

      return { id: jobExecution.id };
    },

    uploadObservationToS3: async (params) => {
      const path = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}evals/${params.projectId}/observations/${params.observationId}.json`;
      const s3Client = getEvalS3StorageClient();

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
          id: params.jobExecutionId,
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
