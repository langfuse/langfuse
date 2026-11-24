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
  createEvalSchedulerDeps,
  scheduleEvals,
  type EvalSchedulerDeps,
} from "../evaluation/scheduleEvals";
import {
  isTraceDispatchSampled,
  resolveTraceDispatchSamplingRate,
} from "../traceDispatch/traceDispatchSampling";
import {
  createDirectOtelMediaTargets,
  processOtelEventMedia,
  type OtelMediaPresence,
} from "../otel-media/processOtelMedia";
import type { IngestionService } from "../../services/IngestionService";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";
import {
  emitOtelCaptureFailure,
  emitOtelEffect,
  emitOtelOperationFailure,
  hashOtelObservation,
  type OtelObservationEvalEffect,
  type OtelShadowCapture,
} from "./otelEffectsCapture";

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
  shadowCapture?: OtelShadowCapture;
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
  shadowCapture,
}: ProcessOtelEventsParams): Promise<OtelMediaPresence | undefined> {
  // Evals and direct event writes share the enriched trace attributes.
  const eventInputs = processor.processToEvent(resourceSpans);
  if (eventInputs.length === 0) {
    return;
  }

  // Trace recording requires direct events-table writes.
  const traceDispatchSamplingRate =
    shouldWriteToEventsTable && isEventsDispatchEnabled()
      ? await resolveTraceDispatchSamplingRate(projectId)
      : 0;
  const includeTraceTranscriptRules = eventInputs.some(({ traceId }) =>
    isTraceDispatchSampled(traceId, traceDispatchSamplingRate),
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
      ...(shadowCapture ? { shadowCapture } : {}),
    });
  }

  const schedulerDeps = needsScheduler
    ? createEvalSchedulerDeps(projectId, rules)
    : null;

  if (shadowCapture) {
    emitOtelEffect(shadowCapture, {
      kind: "scheduling-context",
      projectId,
      traceDispatchSamplingRate,
      evalRules: rules,
      traceTranscriptRules:
        schedulerDeps?.traceTranscriptRules ?? Promise.resolve([] as never[]),
    });
  }

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
        emitOtelOperationFailure(shadowCapture, {
          operation: "direct-row-create",
          mode: "actual",
          projectId,
          traceId: eventInput.traceId,
          observationId: eventInput.spanId,
          error,
        });
        traceException(error);
        logger.error(
          `Failed to create event record for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
          { error, fileKey },
        );

        return;
      }

      const eventSchedulerDeps =
        schedulerDeps && shadowCapture?.capture
          ? createShadowEvalSchedulerDeps({
              schedulerDeps,
              shadowCapture,
              traceId: eventInput.traceId,
              observationId: eventInput.spanId,
            })
          : schedulerDeps;

      // Step 2: Keep transcript matches even if observation scheduling fails.
      const traceActivity = isTraceDispatchSampled(
        eventInput.traceId,
        traceDispatchSamplingRate,
      )
        ? {
            traceId: eventInput.traceId,
            spanStartTimeISO: eventInput.startTimeISO,
          }
        : undefined;
      const matchedRuleIds = eventSchedulerDeps
        ? await scheduleEvals({
            parseObservation: () => {
              try {
                const observation =
                  convertEventRecordToObservationForEval(eventRecord);
                return { observation, loadSnapshot: () => observation };
              } catch (error) {
                emitOtelOperationFailure(shadowCapture, {
                  operation: "observation-normalization",
                  mode: "actual",
                  projectId,
                  traceId: eventInput.traceId,
                  observationId: eventInput.spanId,
                  error,
                });
                throw error;
              }
            },
            environment: eventRecord.environment,
            traceActivity,
            rules,
            schedulerDeps: eventSchedulerDeps,
            buildFailureContext: () => ({
              projectId: eventInput.projectId,
              observationId: eventInput.spanId,
              fileKey,
            }),
          })
        : undefined;

      // Step 3: Write to events table (independent of eval scheduling)
      if (shouldWriteToEventsTable) {
        try {
          const persistedRecord = shadowCapture
            ? await ingestionService.writeEventRecord(
                eventRecord,
                shadowCapture,
              )
            : await ingestionService.writeEventRecord(eventRecord);
          // Record activity only after the event writer accepts the span.
          if (
            traceActivity &&
            eventSchedulerDeps &&
            matchedRuleIds !== undefined
          ) {
            const traceRecording = {
              ...traceActivity,
              ruleIds: matchedRuleIds,
              serializedEventBytes:
                persistedRecord.event_bytes ??
                Buffer.byteLength(JSON.stringify(persistedRecord), "utf8"),
            };
            if (shadowCapture?.capture) {
              emitOtelEffect(shadowCapture, {
                kind: "trace-recording",
                projectId,
                ...traceRecording,
              });
            }
            eventSchedulerDeps.collectTraceActivity(traceRecording);
          }
        } catch (error) {
          emitOtelOperationFailure(shadowCapture, {
            operation: "direct-row-write",
            mode: "actual",
            projectId,
            traceId: eventInput.traceId,
            observationId: eventInput.spanId,
            error,
          });
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
  return mediaPresence;
}

function createShadowEvalSchedulerDeps(params: {
  schedulerDeps: EvalSchedulerDeps;
  shadowCapture: OtelShadowCapture | undefined;
  traceId: string;
  observationId: string;
}): EvalSchedulerDeps {
  const { schedulerDeps, shadowCapture } = params;
  if (!shadowCapture?.capture) return schedulerDeps;

  const jobExecutions = new Map<
    string,
    Parameters<EvalSchedulerDeps["upsertJobExecution"]>[0]
  >();
  let observationHash: string | undefined;

  return {
    ...schedulerDeps,
    upsertJobExecution: async (jobExecution) => {
      try {
        const result = await schedulerDeps.upsertJobExecution(jobExecution);
        jobExecutions.set(jobExecution.id, jobExecution);
        emitOtelEffect(shadowCapture, {
          kind: "eval-upsert",
          projectId: jobExecution.projectId,
          jobExecutionId: jobExecution.id,
          jobConfigurationId: jobExecution.jobConfigurationId,
        });
        return result;
      } catch (error) {
        emitOtelOperationFailure(shadowCapture, {
          operation: "eval-upsert",
          mode: "actual",
          projectId: jobExecution.projectId,
          traceId: jobExecution.jobInputTraceId,
          observationId: jobExecution.jobInputObservationId,
          error,
        });
        throw error;
      }
    },
    uploadObservationToS3: async (request) => {
      try {
        observationHash = hashOtelObservation(request.data);
      } catch (error) {
        observationHash = undefined;
        emitOtelCaptureFailure(
          shadowCapture,
          "observation-hash",
          "actual",
          error,
        );
      }
      try {
        const path = await schedulerDeps.uploadObservationToS3(request);
        if (observationHash !== undefined) {
          emitOtelEffect(shadowCapture, {
            kind: "eval-blob-upload",
            projectId: request.projectId,
            traceId: request.traceId,
            observationId: request.observationId,
            observationHash,
          });
        }
        return path;
      } catch (error) {
        emitOtelOperationFailure(shadowCapture, {
          operation: "eval-blob-upload",
          mode: "actual",
          projectId: request.projectId,
          traceId: request.traceId,
          observationId: request.observationId,
          error,
        });
        throw error;
      }
    },
    enqueueEvalJob: async (request) => {
      const jobExecution = jobExecutions.get(request.jobExecutionId);
      try {
        await schedulerDeps.enqueueEvalJob(request);
      } catch (error) {
        emitOtelOperationFailure(shadowCapture, {
          operation: "eval-enqueue",
          mode: "actual",
          projectId: request.projectId,
          traceId: jobExecution?.jobInputTraceId,
          observationId: jobExecution?.jobInputObservationId,
          error,
        });
        throw error;
      }
      if (jobExecution && observationHash !== undefined) {
        const effect: OtelObservationEvalEffect = {
          kind: "observation-eval",
          projectId: jobExecution.projectId,
          traceId: params.traceId,
          observationId: params.observationId,
          jobExecutionId: jobExecution.id,
          jobConfigurationId: jobExecution.jobConfigurationId,
          jobTemplateId: jobExecution.jobTemplateId,
          jobInputTraceId: jobExecution.jobInputTraceId,
          jobInputObservationId: jobExecution.jobInputObservationId,
          observationHash,
          request,
        };
        emitOtelEffect(shadowCapture, effect);
      } else if (!jobExecution) {
        emitOtelOperationFailure(shadowCapture, {
          operation: "eval-enqueue",
          mode: "actual",
          projectId: request.projectId,
          error: new Error(
            `Missing captured job execution for ${request.jobExecutionId}`,
          ),
        });
      }
    },
  };
}
