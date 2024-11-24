import { Job, Processor } from "bullmq";
import {
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  deleteTraces,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

export const traceDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.TraceDelete]>,
): Promise<void> => {
  const { traceId, projectId } = job.data.payload;
  await prisma.$transaction([
    prisma.trace.deleteMany({
      where: {
        id: traceId,
        projectId: projectId,
      },
    }),
    prisma.observation.deleteMany({
      where: {
        traceId,
        projectId: projectId,
      },
    }),
    prisma.score.deleteMany({
      where: {
        traceId,
        projectId: projectId,
      },
    }),
    // given traces and observations live in ClickHouse we cannot enforce a fk relationship and onDelete: setNull
    prisma.jobExecution.updateMany({
      where: {
        jobInputTraceId: traceId,
        projectId: projectId,
      },
      data: {
        jobInputTraceId: {
          set: null,
        },
        jobInputObservationId: {
          set: null,
        },
      },
    }),
  ]);

  if (env.CLICKHOUSE_URL) {
    await Promise.all([
      deleteTraces(projectId, [traceId]),
      deleteObservationsByTraceIds(projectId, [traceId]),
      deleteScoresByTraceIds(projectId, [traceId]),
    ]);
  }
};
