import {
  RegressionRunCreateEventSchema,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import z from "zod/v4";
import {
  createExperimentJobClickhouse,
  type ExperimentJobResult,
} from "../experiments/experimentServiceClickhouse";

export const createRegressionRunJobClickhouse = async ({
  event,
}: {
  event: z.infer<typeof RegressionRunCreateEventSchema>;
}) => {
  const startTime = Date.now();
  logger.info("Processing regression run create job", event);

  const { projectId, runId, datasetId, description } = event;
  const now = new Date();

  try {
    const run = await kyselyPrisma.$kysely
      .selectFrom("regression_runs")
      .selectAll()
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .executeTakeFirst();

    if (!run) {
      throw new Error(
        `Regression run ${runId} for project ${projectId} no longer exists`,
      );
    }

    // Mark regression run as running while the underlying experiment processing executes
    await kyselyPrisma.$kysely
      .updateTable("regression_runs")
      .set({ status: "running", updated_at: now })
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .execute();

    // Execute the same processing flow as dataset/experiment runs
    const experimentResult: ExperimentJobResult =
      await createExperimentJobClickhouse({
        event: {
          projectId,
          datasetId,
          runId,
          description,
        },
      });

    // Count dataset run items from ClickHouse instead of Postgres
    const processedCountResult = await queryClickhouse<{ count: string }>({
      query: `
        SELECT COUNT(*) as count
        FROM dataset_run_items_rmt
        WHERE dataset_run_id = {runId: String}
        AND project_id = {projectId: String}
      `,
      params: { runId, projectId },
      tags: {
        feature: "regression-runs",
        type: "count",
        projectId,
      },
    });

    const processedCount = Number(processedCountResult[0]?.count ?? 0);

    const duration = Date.now() - startTime;

    const finalStatus = experimentResult.configError ? "failed" : "completed";

    await kyselyPrisma.$kysely
      .updateTable("regression_runs")
      .set({ status: finalStatus, updated_at: new Date() })
      .where("id", "=", runId)
      .where("project_id", "=", projectId)
      .execute();

    logger.info(
      experimentResult.configError
        ? `Regression run ${runId} failed in ${duration}ms due to configuration error: ${experimentResult.configError}`
        : `Regression run ${runId} completed successfully in ${duration}ms (processed ${processedCount} items)`,
    );
    return {
      success: !experimentResult.configError,
      processedCount,
      configError: experimentResult.configError,
    };
  } catch (error) {
    logger.error(`Failed to process regression run ${runId}`, error);

    try {
      await kyselyPrisma.$kysely
        .updateTable("regression_runs")
        .set({ status: "failed", updated_at: new Date() })
        .where("id", "=", runId)
        .where("project_id", "=", projectId)
        .execute();
    } catch (statusError) {
      logger.error(
        `Failed to update regression run ${runId} status after error`,
        statusError,
      );
    }

    throw error;
  }
};
