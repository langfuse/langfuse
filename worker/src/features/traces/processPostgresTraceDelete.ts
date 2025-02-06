import { prisma } from "@langfuse/shared/src/db";
import { logger, traceException } from "@langfuse/shared/src/server";

export const processPostgresTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId} from Postgres`,
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
};
