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
import { createEvalSchedulerDeps } from "../evaluation/scheduleEvals";
import {
  isObservationAllowedForQueuedObservationEvals,
  scheduleObservationEvals,
} from "../evaluation/observationEval/scheduleObservationEvals";
import { scheduleTraceTranscriptEvals } from "../evaluation/traceTranscriptEval/scheduleTraceTranscriptEvals";
import { trackTraceBatchActivity } from "../traceBatching/traceBatching";
import {
  isTraceBatchSampled,
  resolveTraceBatchSamplingRate,
} from "../traceBatching/traceBatchSampling";
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
  // 1. Scheduling observation evals and matching trace-rule selections
  // 2. Writing directly to events table (if SDK version requirements are met)
  //
  // A matched span is buffered for the trace-rule maps only after that write
  // returns. Both steps require enriched event records with trace-level
  // attributes (userId, sessionId, tags, release) that processToEvent provides.
  const eventInputs = processor.processToEvent(resourceSpans);
  if (eventInputs.length === 0) {
    return;
  }

  // Trace rules record only eligible direct event writes, like existing trace batching.
  const traceBatchSamplingRate = shouldWriteToEventsTable
    ? await resolveTraceBatchSamplingRate(projectId)
    : 0;
  const includeTraceTranscriptRules = eventInputs.some(({ traceId }) =>
    isTraceBatchSampled(traceId, traceBatchSamplingRate),
  );
  const rules = await fetchEvalRules(projectId, {
    includeTraceTranscriptRules,
  }).catch((error) => {
    traceException(error);
    logger.warn(`Failed to fetch eval rules for project ${projectId}`, error);
    return { observationRules: [], traceTranscriptRules: [] };
  });
  const needsEvalScheduling =
    rules.observationRules.length > 0 || includeTraceTranscriptRules;

  // Early exit if no processing needed
  if (!needsEvalScheduling && !shouldWriteToEventsTable) {
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

  const schedulerDeps = needsEvalScheduling
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

      // Step 2: Match transcript rules, then schedule observation evals.
      // The selection stays in this local when observation scheduling throws.
      // Nothing is buffered until the events write below returns.
      const traceActivity = isTraceBatchSampled(
        eventInput.traceId,
        traceBatchSamplingRate,
      )
        ? {
            traceId: eventInput.traceId,
            spanStartTimeISO: eventInput.startTimeISO,
          }
        : undefined;
      let matchedRuleIds: readonly string[] | undefined;
      if (
        schedulerDeps &&
        (rules.observationRules.length > 0 || traceActivity)
      ) {
        try {
          const observation =
            convertEventRecordToObservationForEval(eventRecord);
          try {
            matchedRuleIds = await scheduleTraceTranscriptEvals({
              observation,
              traceActivity,
              schedulerDeps,
            });
          } catch (error) {
            traceException(error);
            logger.error(
              `Failed to match trace transcript rules for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
              { error, fileKey },
            );
          }
          if (isObservationAllowedForQueuedObservationEvals(observation)) {
            await scheduleObservationEvals({
              observation,
              configs: rules.observationRules,
              schedulerDeps,
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
          // A thrown write skips this push, so the trace-rule maps stay unchanged.
          if (traceActivity && schedulerDeps && matchedRuleIds !== undefined) {
            schedulerDeps.collectTraceActivity({
              ...traceActivity,
              ruleIds: matchedRuleIds,
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
