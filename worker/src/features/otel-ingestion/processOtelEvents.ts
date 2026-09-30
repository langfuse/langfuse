import { convertEventRecordToObservationForEval } from "@langfuse/shared";
import {
  logger,
  OtelIngestionProcessor,
  recordDistribution,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  fetchObservationEvalRules,
  isObservationAllowedForQueuedObservationEvals,
  scheduleObservationEvals,
  createObservationEvalSchedulerDeps,
} from "../evaluation/observationEval";
import { trackTraceBatchActivity } from "../traceBatching/traceBatching";
import {
  createDirectOtelMediaTargets,
  processOtelEventMedia,
} from "../otel-media/processOtelMedia";
import type { IngestionService } from "../../services/IngestionService";

type ProcessOtelEventsParams = {
  processor: OtelIngestionProcessor;
  resourceSpans: Parameters<OtelIngestionProcessor["processToEvent"]>[0];
  ingestionService: IngestionService;
  projectId: string;
  fileKey: string;
  shouldWriteToEventsTable: boolean;
};

/**
 * Processes a resource-spans batch for observation eval scheduling and direct
 * events-table writes.
 *
 * Legacy OTEL persistence remains owned by the queue. This phase starts from
 * the same processor and resource-spans batch, and keeps enrichment before
 * eval scheduling and direct persistence so both consumers observe the same
 * event record.
 */
export async function processOtelEvents({
  processor,
  resourceSpans,
  ingestionService,
  projectId,
  fileKey,
  shouldWriteToEventsTable,
}: ProcessOtelEventsParams): Promise<void> {
  // Process events for observation evals and direct event writes
  // This phase handles two independent concerns:
  // 1. Scheduling observation-level evals (if eval configs exist)
  // 2. Writing directly to events table (if SDK version requirements are met)
  //
  // Both require enriched event records with trace-level attributes
  // (userId, sessionId, tags, release) that processToEvent provides.
  const eventInputs = processor.processToEvent(resourceSpans);

  if (eventInputs.length === 0) {
    return;
  }

  const evalConfigs = await fetchObservationEvalRules(projectId).catch(
    (error) => {
      traceException(error);
      logger.warn(
        `Failed to fetch observation eval configs for project ${projectId}`,
        error,
      );

      return [];
    },
  );
  const hasEvalConfigs = evalConfigs.length > 0;

  // Early exit if no processing needed
  if (!hasEvalConfigs && !shouldWriteToEventsTable) {
    return;
  }

  if (
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED === "true" &&
    shouldWriteToEventsTable
  ) {
    await processOtelEventMedia({
      targets: createDirectOtelMediaTargets(eventInputs),
      writePath: "direct",
      projectId,
      fileKey,
      mediaBucket: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    });
  }

  // Create scheduler deps only if we have eval configs
  const evalSchedulerDeps = hasEvalConfigs
    ? createObservationEvalSchedulerDeps()
    : null;

  const traceBatchEvents: {
    traceId: string;
    startTimeISO: string;
    serializedEventBytes: number;
  }[] = [];

  await Promise.all(
    // Process each event independently
    eventInputs.map(async (eventInput) => {
      // Step 1: Create enriched event record (required for both evals and writes)
      let eventRecord;
      try {
        eventRecord = await ingestionService.createEventRecord(
          eventInput,
          fileKey,
        );
      } catch (error) {
        traceException(error);
        logger.error(
          `Failed to create event record for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
          { error, fileKey },
        );

        return;
      }

      // Step 2: Schedule observation evals (independent of event writes).
      // Internal langfuse-* environments are excluded to prevent
      // eval-on-eval recursion, except experiment run-item roots; see
      // isObservationAllowedForQueuedObservationEvals.
      if (hasEvalConfigs && evalSchedulerDeps) {
        try {
          const observation =
            convertEventRecordToObservationForEval(eventRecord);

          if (isObservationAllowedForQueuedObservationEvals(observation)) {
            await scheduleObservationEvals({
              observation,
              configs: evalConfigs,
              schedulerDeps: evalSchedulerDeps,
            });
          }
        } catch (error) {
          traceException(error);

          logger.error(
            `Failed to schedule observation evals for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
            { error, fileKey },
          );
        }
      }

      // Step 3: Write to events table (independent of eval scheduling)
      if (shouldWriteToEventsTable) {
        try {
          const serializedEventBytes =
            await ingestionService.writeEventRecord(eventRecord);
          if (
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
            env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED === "true"
          ) {
            traceBatchEvents.push({
              traceId: eventInput.traceId,
              startTimeISO: eventInput.startTimeISO,
              serializedEventBytes,
            });
          }
        } catch (error) {
          traceException(error);
          logger.error(
            `Failed to write event record for ${eventInput.spanId}`,
            { error, fileKey },
          );
        }
      }
    }),
  );

  if (traceBatchEvents.length > 0) {
    recordDistribution(
      "langfuse.trace_batch.ingestion_trace_count",
      new Set(traceBatchEvents.map((event) => event.traceId)).size,
    );
    // The writer has accepted these records; its flush completes separately.
    await trackTraceBatchActivity(projectId, traceBatchEvents);
  }
}
