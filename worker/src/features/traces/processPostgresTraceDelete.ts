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
    // Filtering on the project's rule ids lets Postgres use the
    // (project_id, job_configuration_id, job_input_trace_id) index instead of
    // scanning every job execution of the project. job_configuration_id
    // references evaluation_rules, legacy job_configurations, or, for batch
    // runs of evaluators without a rule, evaluators.
    const [evaluationRules, jobConfigurations, evaluators] = await Promise.all([
      prisma.evaluationRule.findMany({
        where: { projectId },
        select: { id: true },
      }),
      prisma.jobConfiguration.findMany({
        where: { projectId },
        select: { id: true },
      }),
      prisma.evaluator.findMany({
        where: { projectId },
        select: { id: true },
      }),
    ]);
    const ruleIds = [
      ...new Set(
        [...evaluationRules, ...jobConfigurations, ...evaluators].map(
          (r) => r.id,
        ),
      ),
    ];
    if (ruleIds.length === 0) return;

    await prisma.jobExecution.deleteMany({
      where: {
        projectId: projectId,
        jobConfigurationId: {
          in: ruleIds,
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
