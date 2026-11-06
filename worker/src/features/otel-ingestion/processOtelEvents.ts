import { restoreInlineMedia } from "../otel-media/resolveExtractedMedia";
import type { EarlyOtelBatch } from "@langfuse/native";
import { convertEventRecordToObservationForEval } from "@langfuse/shared";
import {
  isInternalEvalEnvironment,
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
import {
  getTraceBatchExperimentRuleIds,
  scheduleTraceTranscriptEvals,
} from "../evaluation/traceTranscriptEval/scheduleTraceTranscriptEvals";
import { trackLegacyTopicsBatchActivity } from "../traceBatching/traceBatching";
import {
  isTraceBatchSampled,
  isTraceDispatchEnabled,
  isLegacyTopicsBatchingEnabled,
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
  // Evals and direct event writes share the enriched trace attributes.
  const eventInputs = processor.processToEvent(resourceSpans);
  if (eventInputs.length === 0) {
    return;
  }

  // Trace recording requires direct events-table writes.
  const traceBatchSamplingRate =
    shouldWriteToEventsTable && isTraceDispatchEnabled()
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
  const needsScheduler =
    rules.observationRules.length > 0 || includeTraceTranscriptRules;

  // Early exit if no processing needed
  if (!needsScheduler && !shouldWriteToEventsTable) {
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

  const schedulerDeps = needsScheduler
    ? createEvalSchedulerDeps(projectId, rules)
    : null;

  const legacyTopicsBatchEvents: {
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

      // Step 2: Keep transcript matches even if observation scheduling fails.
      const traceActivity =
        isTraceBatchSampled(eventInput.traceId, traceBatchSamplingRate) &&
        !isInternalEvalEnvironment(eventRecord.environment)
          ? {
              traceId: eventInput.traceId,
              spanStartTimeISO: eventInput.startTimeISO,
            }
          : undefined;
      // Recording without rules needs no evaluation observation or filter pass.
      let matchedRuleIds: readonly string[] | undefined =
        traceActivity && rules.traceTranscriptRules.length === 0
          ? getTraceBatchExperimentRuleIds(traceActivity.traceId)
          : undefined;
      if (
        schedulerDeps &&
        (rules.observationRules.length > 0 ||
          (traceActivity && rules.traceTranscriptRules.length > 0))
      ) {
        try {
          const observation =
            convertEventRecordToObservationForEval(eventRecord);
          try {
            if (traceActivity && rules.traceTranscriptRules.length > 0) {
              matchedRuleIds = await scheduleTraceTranscriptEvals({
                observation,
                traceActivity,
                schedulerDeps,
              });
            }
          } catch (error) {
            logger.warn(
              `Failed to match trace transcript rules for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
              { error, fileKey },
            );
          }
          // Skip internal langfuse-* environments to prevent eval-on-eval recursion,
          // except experiment run-item roots.
          if (isObservationAllowedForQueuedObservationEvals(observation)) {
            await scheduleObservationEvals({
              observation,
              configs: rules.observationRules,
              schedulerDeps,
            });
          }
        } catch (error) {
          if (rules.observationRules.length > 0) {
            traceException(error);
            logger.error(
              `Failed to schedule observation evals for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
              { error, fileKey },
            );
          } else {
            logger.warn(
              `Failed to normalize observation for trace transcript rules for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
              { error, fileKey },
            );
          }
        }
      }

      // Step 3: Write to events table (independent of eval scheduling)
      if (shouldWriteToEventsTable) {
        try {
          const persistedRecord =
            await ingestionService.writeEventRecord(eventRecord);
          if (isLegacyTopicsBatchingEnabled()) {
            legacyTopicsBatchEvents.push({
              traceId: eventInput.traceId,
              startTimeISO: eventInput.startTimeISO,
              // This guards trace-read capacity independently of billing size.
              serializedEventBytes:
                persistedRecord.event_bytes ??
                Buffer.byteLength(JSON.stringify(persistedRecord), "utf8"),
            });
          }
          // Record activity only after the event writer accepts the span.
          if (traceActivity && schedulerDeps && matchedRuleIds !== undefined) {
            schedulerDeps.collectTraceActivity({
              ...traceActivity,
              ruleIds: matchedRuleIds,
              serializedEventBytes:
                persistedRecord.event_bytes ??
                Buffer.byteLength(JSON.stringify(persistedRecord), "utf8"),
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
    // Flush this batch's activity; Lua merges updates across workers.
    await schedulerDeps.flushTraceActivity();
  }

  if (legacyTopicsBatchEvents.length > 0) {
    // The writer has accepted these records; its flush completes separately.
    await trackLegacyTopicsBatchActivity(projectId, legacyTopicsBatchEvents);
  }
  return mediaPresence;
}
