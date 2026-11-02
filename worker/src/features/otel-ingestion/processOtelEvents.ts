import { restoreInlineMedia } from "../otel-media/resolveExtractedMedia";
import type { EarlyOtelBatch } from "@langfuse/native";
import {
  convertEventRecordToObservationForEval,
  type ObservationForEval,
} from "@langfuse/shared";
import {
  logger,
  OtelIngestionProcessor,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  fetchObservationEvalRules,
  fetchIngestionEvalRules,
  isObservationAllowedForQueuedObservationEvals,
  scheduleObservationEvals,
  createObservationEvalSchedulerDeps,
} from "../evaluation/observationEval";
import { trackTraceBatchActivity } from "../traceBatching/traceBatching";
import {
  getMatchingTraceBatchRuleIds,
  prepareTraceBatchRules,
} from "../traceBatching/traceBatchRules";
import { recordTraceRuleMatches } from "../traceBatching/traceRuleRecording";
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

  const recordingEnabled =
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.LANGFUSE_TRACE_RULE_RECORDING_ENABLED === "true";
  const rules = await (
    recordingEnabled
      ? fetchIngestionEvalRules(projectId)
      : fetchObservationEvalRules(projectId).then((observationRules) => ({
          observationRules,
          traceRules: [],
        }))
  ).catch((error) => {
    traceException(error);
    logger.warn(
      `Failed to fetch ingestion eval rules for project ${projectId}`,
      error,
    );

    return { observationRules: [], traceRules: [] };
  });
  const evalConfigs = rules.observationRules;
  const hasEvalConfigs = evalConfigs.length > 0;
  const traceRules = await prepareTraceBatchRules(
    projectId,
    rules.traceRules,
  ).catch((error) => {
    traceException(error);
    logger.warn("Failed to prepare trace rules", { projectId, error });
    return [];
  });
  const hasTraceRules = traceRules.length > 0;

  // Early exit if no processing needed
  if (!hasEvalConfigs && !hasTraceRules && !shouldWriteToEventsTable) {
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

  // Create scheduler deps only if we have eval configs
  const evalSchedulerDeps = hasEvalConfigs
    ? createObservationEvalSchedulerDeps()
    : null;

  const traceBatchEvents: {
    traceId: string;
    startTimeISO: string;
    serializedEventBytes: number;
  }[] = [];
  const traceRuleEvents: {
    traceId: string;
    startTimeISO: string;
    ruleIds: string[];
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

      // Step 2: Match evaluation rules (independent of event writes).
      // Internal environments cannot select rules or schedule evaluations, except
      // experiment run-item roots. All observations still extend retained bounds
      // and existing readiness, including experiment child spans.
      let observation: ObservationForEval | undefined;
      if (hasEvalConfigs || hasTraceRules) {
        try {
          observation = convertEventRecordToObservationForEval(eventRecord);
        } catch (error) {
          traceException(error);
          logger.error("Failed to normalize observation for evaluation", {
            projectId,
            observationId: eventInput.spanId,
            error,
            fileKey,
          });
        }
      }

      const canEvaluate =
        observation &&
        isObservationAllowedForQueuedObservationEvals(observation);
      if (observation && hasTraceRules) {
        try {
          traceRuleEvents.push({
            traceId: observation.trace_id,
            startTimeISO: eventInput.startTimeISO,
            ruleIds: canEvaluate
              ? getMatchingTraceBatchRuleIds(observation, traceRules)
              : [],
          });
        } catch (error) {
          traceException(error);
          logger.error("Failed to match trace rules", {
            projectId,
            observationId: eventInput.spanId,
            error,
            fileKey,
          });
        }
      }

      if (observation && canEvaluate && evalSchedulerDeps) {
        try {
          await scheduleObservationEvals({
            observation,
            configs: evalConfigs,
            schedulerDeps: evalSchedulerDeps,
          });
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

  if (traceRuleEvents.length > 0) {
    try {
      await recordTraceRuleMatches(projectId, traceRuleEvents);
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
