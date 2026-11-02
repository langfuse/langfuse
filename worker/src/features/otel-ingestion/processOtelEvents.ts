import { restoreInlineMedia } from "../otel-media/resolveExtractedMedia";
import type { EarlyOtelBatch } from "@langfuse/native";
import { convertEventRecordToObservationForEval } from "@langfuse/shared";
import {
  logger,
  OtelIngestionProcessor,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { fetchEvalRules } from "../evaluation/fetchEvalRules";
import {
  scheduleEvals,
  createEvalSchedulerDeps,
} from "../evaluation/scheduleEvals";
import { trackTraceBatchActivity } from "../traceBatching/traceBatching";
import {
  createDirectOtelMediaTargets,
  processOtelEventMedia,
  type OtelMediaPresence,
} from "../otel-media/processOtelMedia";
import type { IngestionService } from "../../services/IngestionService";

type ProcessOtelEventsParams = {
  processor: OtelIngestionProcessor;
  resourceSpans: Parameters<OtelIngestionProcessor["processToEvent"]>[0];
  ingestionService: IngestionService;
  projectId: string;
  fileKey: string;
  shouldWriteToEventsTable: boolean;
  earlyBatch?: EarlyOtelBatch;
  mediaPath?: "early" | "reference";
  inputByteLength?: number;
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
  earlyBatch,
  mediaPath,
  inputByteLength,
}: ProcessOtelEventsParams): Promise<OtelMediaPresence | undefined> {
  // Process events for observation evals and direct event writes
  // This phase handles two independent concerns:
  // 1. Scheduling observation evals and recording trace-rule selections
  // 2. Writing directly to events table (if SDK version requirements are met)
  //
  // Both require enriched event records with trace-level attributes
  // (userId, sessionId, tags, release) that processToEvent provides.
  const eventInputs = processor.processToEvent(resourceSpans);
  if (eventInputs.length === 0) {
    return;
  }

  const rules = await fetchEvalRules(projectId).catch((error) => {
    traceException(error);
    logger.warn(`Failed to fetch eval rules for project ${projectId}`, error);
    return { observationRules: [], traceTranscriptRules: [] };
  });
  const hasRules =
    rules.observationRules.length > 0 || rules.traceTranscriptRules.length > 0;

  // Early exit if no processing needed
  if (!hasRules && !shouldWriteToEventsTable) {
    return;
  }

  if (earlyBatch) {
    // Evaluation-only records skip direct media resolution, so restore their
    // extracted references before evaluation scheduling reads their payloads.
    await restoreInlineMedia(earlyBatch, eventInputs, {
      includePayloads: !shouldWriteToEventsTable,
    });
  }

  let mediaPresence: OtelMediaPresence | undefined;
  if (
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED === "true" &&
    shouldWriteToEventsTable
  ) {
    mediaPresence = await processOtelEventMedia({
      targets: createDirectOtelMediaTargets(eventInputs),
      writePath: "direct",
      earlyBatch,
      mediaPath,
      inputByteLength,
      projectId,
      fileKey,
      mediaBucket: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    });
  }

  const schedulerDeps = hasRules
    ? createEvalSchedulerDeps(projectId, rules)
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

      // Step 2: Schedule evaluations independently of event writes.
      if (schedulerDeps) {
        try {
          await scheduleEvals({
            observation: convertEventRecordToObservationForEval(eventRecord),
            startTimeISO: eventInput.startTimeISO,
            rules,
            schedulerDeps,
          });
        } catch (error) {
          traceException(error);

          logger.error(
            `Failed to schedule evals for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
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

  if (schedulerDeps) {
    try {
      // Flush this invocation's local buffer; Redis merges activity across workers.
      await schedulerDeps.flushTraceActivity();
    } catch (error) {
      traceException(error);
      logger.error("Failed to record trace rule selections", {
        projectId,
        error,
        fileKey,
      });
    }
  }

  if (traceBatchEvents.length > 0) {
    // The writer has accepted these records; its flush completes separately.
    await trackTraceBatchActivity(projectId, traceBatchEvents);
  }
  return mediaPresence;
}
