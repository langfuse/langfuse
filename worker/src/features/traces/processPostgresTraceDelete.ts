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
    // Filtering on the project's configuration ids lets Postgres use the
    // (project_id, job_configuration_id, job_input_trace_id) index instead of
    // scanning every job execution of the project.
    const jobConfigurations = await prisma.jobConfiguration.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (jobConfigurations.length === 0) return;

    await prisma.jobExecution.deleteMany({
      where: {
        projectId: projectId,
        jobConfigurationId: {
          in: jobConfigurations.map((config) => config.id),
        },
        jobInputTraceId: {
          in: traceIds,
        },
      },
    });
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Postgres`,
      e,
    );
    traceException(e);
    throw e;
  }
};
