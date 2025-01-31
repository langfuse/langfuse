import { Job, Processor } from "bullmq";
import {
  logger,
  QueueName,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { processClickhouseTraceDelete } from "../features/traces/processClickhouseTraceDelete";

export const traceDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.TraceDelete]>,
): Promise<void> => {
  const projectId = job.data.payload.projectId;
  const traceIds =
    "traceIds" in job.data.payload
      ? job.data.payload.traceIds
      : [job.data.payload.traceId];

  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId}`,
  );
  try {
    await prisma.$transaction([
      prisma.trace.deleteMany({
        where: {
          id: {
            in: traceIds,
          },
          projectId: projectId,
        },
      }),
      prisma.observation.deleteMany({
        where: {
          traceId: {
            in: traceIds,
          },
          projectId: projectId,
        },
      }),
      prisma.score.deleteMany({
        where: {
          traceId: {
            in: traceIds,
          },
          projectId: projectId,
        },
      }),
      // given traces and observations live in ClickHouse we cannot enforce a fk relationship and onDelete: setNull
      prisma.jobExecution.updateMany({
        where: {
          jobInputTraceId: {
            in: traceIds,
          },
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
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Postgres`,
      e,
    );
    traceException(e);
    throw e;
  }

  if (env.CLICKHOUSE_URL) {
    await processClickhouseTraceDelete(projectId, traceIds);
  }
};
