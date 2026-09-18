import {
  getObservationsForTraceFromEventsTable,
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";

const METRIC = "langfuse.trace_upsert.observation_io_benchmark";

/**
 * Reads every observation for one trace with its input/output and reports how
 * long that took and how many rows carried I/O. Read-only, and swallows its own
 * failures: it sizes the lookup rather than feeding a caller.
 */
export const runTraceObservationIoBenchmark = async (params: {
  projectId: string;
  traceId: string;
  timestamp: Date;
}): Promise<void> => {
  const { projectId, traceId, timestamp } = params;
  const startedAt = performance.now();

  try {
    const { observations, totalCount } =
      await getObservationsForTraceFromEventsTable({
        projectId,
        traceId,
        timestamp,
        selectIOAndMetadata: true,
        selectToolData: true,
      });

    const observationsWithIo = observations.filter(
      ({ input, output }) => input !== null || output !== null,
    ).length;

    recordIncrement(`${METRIC}.read`);
    recordDistribution(`${METRIC}.observation_count`, totalCount);
    recordDistribution(
      `${METRIC}.observation_with_io_count`,
      observationsWithIo,
    );
  } catch (error) {
    logger.warn("Failed trace observation I/O benchmark", {
      error,
      projectId,
      traceId,
    });
    recordIncrement(`${METRIC}.failure`);
  } finally {
    recordDistribution(
      `${METRIC}.duration_ms`,
      Math.round(performance.now() - startedAt),
    );
  }
};
