import type {
  EarlyOtelBatch,
  FinalizedOtelBatch,
  OtelLookupRequest,
  OtelMediaRequest,
  OtelMediaResolution,
  OtelOverflowRequest,
  OtelProcessingContext,
  RustOtelBatch,
} from "@langfuse/native";
import {
  convertEventRecordToObservationForEval,
  isMediaContentType,
  MediaAssociationOrigin,
  MediaContentType,
} from "@langfuse/shared";
import {
  findModel,
  forEachMedia,
  getCurrentSpan,
  logger,
  otelMediaUploads,
  PromptService,
  recordDistribution,
  recordIncrement,
  redis,
  SkillCacheService,
  traceException,
  uploadMediaForTrace,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { resolveSkillReferences } from "../../services/IngestionService/skillReferences";
import { env, v4WritesToLegacyTables } from "../../env";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import { TableName } from "../../services/ClickhouseWriter/types";
import { fetchEvalRules, type EvalRules } from "../evaluation/fetchEvalRules";
import {
  createEvalSchedulerDeps,
  scheduleEvals,
} from "../evaluation/scheduleEvals";
import {
  isTraceBatchSampled,
  resolveTraceBatchSamplingRate,
} from "../traceBatching/traceBatchSampling";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";
import type { OtelMediaPresence } from "../otel-media/processOtelMedia";
import {
  recordExtractedMediaUpload,
  uploadExtractedMediaOnce,
} from "../otel-media/resolveExtractedMedia";

type EvalRuleResolution = {
  traceBatchSamplingRate: number;
  sampledTraceIds: string[];
  evalConfigs: EvalRules;
};

type FinalizedEvent = FinalizedOtelBatch["events"][number];
/**
 * Processes a native OTEL batch through service lookups, native completion,
 * evaluation scheduling, and the ClickHouse writer.
 */
export async function processRustOtelEvents(params: {
  batch: EarlyOtelBatch;
  context: OtelProcessingContext;
}): Promise<OtelMediaPresence> {
  const { batch, context } = params;
  const { projectId } = context;
  const samplingRate = isEventsDispatchEnabled()
    ? resolveTraceBatchSamplingRate(projectId)
    : Promise.resolve(0);
  const prepared = await batch.process(context);
  const processing = prepared.batch;
  try {
    const [mediaResults, lookups, rules] = await waitForServiceWork([
      uploadRequestedMedia(batch, processing, prepared.mediaRequests, context),
      resolveLookups(prepared.lookupRequests, context),
      fetchSampledEvalRules(projectId, prepared.traceIds, samplingRate),
    ] as const);
    const finalized = await completeOrFinalizeBatch(
      processing,
      mediaResults,
      lookups,
      rules,
      projectId,
    );
    await writeRecordsAndScheduleEvals(finalized, rules, context);
    return prepared.mediaRequests.length > 0 ? "present" : "absent";
  } finally {
    await processing.dispose();
  }
}

function fetchSampledEvalRules(
  projectId: string,
  traceIds: string[],
  traceBatchSamplingRatePromise: Promise<number>,
): Promise<EvalRuleResolution> {
  return traceBatchSamplingRatePromise.then(async (traceBatchSamplingRate) => {
    // Select transcript rules using `process`'s trace IDs. Pass selected IDs to
    // `complete`/`finalize` to measure rows after oversized fields are replaced.
    const sampledTraceIds = traceIds.filter((traceId) =>
      isTraceBatchSampled(traceId, traceBatchSamplingRate),
    );
    const evalConfigs = await fetchEvalRules(projectId, {
      includeTraceTranscriptRules: sampledTraceIds.length > 0,
    }).catch((error) => {
      traceException(error);
      logger.warn(`Failed to fetch eval rules for project ${projectId}`, error);
      return { observationRules: [], traceTranscriptRules: [] };
    });
    return { traceBatchSamplingRate, sampledTraceIds, evalConfigs };
  });
}

async function waitForServiceWork<T extends readonly Promise<unknown>[]>(
  serviceWork: T,
) {
  try {
    return await Promise.all(serviceWork);
  } catch (error) {
    // Pending uploads still read the native batch; drain them before disposal.
    await Promise.allSettled(serviceWork);
    throw error;
  }
}

async function completeOrFinalizeBatch(
  processing: RustOtelBatch,
  mediaResults: OtelMediaResolution[],
  lookups: object[],
  { evalConfigs, sampledTraceIds }: EvalRuleResolution,
  projectId: string,
): Promise<FinalizedOtelBatch> {
  const overflowLimitBytes =
    env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED === "true"
      ? env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES
      : undefined;
  const includeEvaluationRows =
    evalConfigs.observationRules.length > 0 ||
    evalConfigs.traceTranscriptRules.length > 0;
  const traceActivityIds =
    sampledTraceIds.length > 0 ? sampledTraceIds : undefined;
  const completion = await processing.complete(
    mediaResults,
    lookups,
    overflowLimitBytes,
    includeEvaluationRows,
    traceActivityIds,
  );
  if (completion.finalized) {
    return completion.finalized;
  }

  const overflowResults = await uploadOverflowFields(
    processing,
    completion.overflowRequests,
    projectId,
  );
  return processing.finalize(
    overflowResults,
    includeEvaluationRows,
    traceActivityIds,
  );
}

async function uploadOverflowFields(
  processing: RustOtelBatch,
  requests: OtelOverflowRequest[],
  projectId: string,
): Promise<OtelMediaResolution[]> {
  const overflowResults = new Array<OtelMediaResolution>(requests.length);
  await forEachMedia(requests, async (request) => {
    let reference: string | undefined;
    let outcome = "failed";
    try {
      const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
      if (!mediaBucket)
        throw new Error("Media upload bucket is not configured");
      const field = request.field;
      if (field !== "input" && field !== "output" && field !== "metadata")
        throw new Error("unsupported overflow field");
      const sha256Hash = request.sha256Hash;
      if (!sha256Hash) throw new Error("missing overflow media digest");
      const result = await otelMediaUploads.run(request.byteLength, async () =>
        uploadMediaForTrace({
          projectId,
          traceId: request.traceId,
          observationId: request.observationId,
          field,
          contentType: MediaContentType.TXT,
          contentBytes: await processing.overflowBody(request.index),
          sha256Hash,
          mediaBucket,
          mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
          origin: MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW,
        }),
      );
      reference = `@@@langfuseMedia:type=text/plain|id=${result.mediaId}|source=field_size_limit@@@`;
      outcome = result.outcome;
    } catch (error) {
      logger.warn(
        "Oversized observation field upload failed; persisting original field",
        {
          error,
          projectId,
          observationId: request.observationId,
          field: request.field,
        },
      );
    }
    recordIncrement("langfuse.ingestion.observation_field_overflow", 1, {
      field: request.field,
      outcome,
    });
    recordDistribution(
      "langfuse.ingestion.observation_field_overflow.bytes_removed",
      reference
        ? Math.max(request.byteLength - Buffer.byteLength(reference), 0)
        : 0,
      { field: request.field, outcome },
    );
    overflowResults[request.index] = { index: request.index, reference };
  });
  return overflowResults;
}

function recordIngestionCounts(records: FinalizedEvent[]): void {
  // Dual writes count ingestion in legacy processing; events-only jobs count
  // the finalized rows here.
  if (v4WritesToLegacyTables(env)) return;

  const traceCount = new Set(records.map((record) => record.traceId)).size;
  recordIncrement("langfuse.ingestion.event", records.length, {
    source: "otel",
  });
  recordDistribution("langfuse.ingestion.otel.trace_count", traceCount);
  recordDistribution(
    "langfuse.ingestion.otel.observation_count",
    records.length,
  );
  getCurrentSpan()?.setAttributes({
    "langfuse.ingestion.otel.trace_count": traceCount,
    "langfuse.ingestion.otel.observation_count": records.length,
  });
}

async function writeRecordsAndScheduleEvals(
  { events: records, evaluationRows }: FinalizedOtelBatch,
  { traceBatchSamplingRate, sampledTraceIds, evalConfigs }: EvalRuleResolution,
  { projectId, fileKey }: OtelProcessingContext,
): Promise<void> {
  const needsScheduler =
    evalConfigs.observationRules.length > 0 || sampledTraceIds.length > 0;
  const schedulerDeps = needsScheduler
    ? createEvalSchedulerDeps(projectId, evalConfigs)
    : null;
  const writer = ClickhouseWriter.getNativeInstance();
  recordIngestionCounts(records);
  await Promise.all(
    records.map(async (record, index) => {
      const traceActivity = isTraceBatchSampled(
        record.traceId,
        traceBatchSamplingRate,
      )
        ? {
            traceId: record.traceId,
            spanStartTimeISO: record.startTimeIso,
          }
        : undefined;
      const matchedRuleIds = schedulerDeps
        ? await scheduleEvals({
            parseObservation: () =>
              convertEventRecordToObservationForEval(
                evaluationRows[index] as EventRecordInsertType,
              ),
            environment: record.environment,
            traceActivity,
            rules: evalConfigs,
            schedulerDeps,
            buildFailureContext: () => ({
              projectId,
              observationId: record.event.ids.id,
              fileKey,
            }),
          })
        : undefined;

      try {
        writer.addToQueue(TableName.EventsFull, record.event);
        if (
          traceActivity &&
          matchedRuleIds !== undefined &&
          schedulerDeps &&
          record.serializedEventBytes !== undefined
        ) {
          schedulerDeps.collectTraceActivity({
            ...traceActivity,
            ruleIds: matchedRuleIds,
            serializedEventBytes: record.serializedEventBytes,
          });
        }
      } catch (error) {
        traceException(error);
        logger.error(
          `Failed to write event record for ${record.event.ids.id}`,
          {
            error,
            fileKey,
          },
        );
      }
    }),
  );
  await schedulerDeps?.flushTraceActivity();
}

async function uploadRequestedMedia(
  batch: EarlyOtelBatch,
  processing: RustOtelBatch,
  mediaRequests: OtelMediaRequest[],
  { projectId, fileKey }: OtelProcessingContext,
): Promise<OtelMediaResolution[]> {
  const mediaResults = new Array<OtelMediaResolution>(mediaRequests.length);
  const mediaStartedAt = Date.now();
  let mediaBytesProcessed = 0;
  // Rust retains encoded media. `uploadExtractedMediaOnce` reuses successful uploads
  // across legacy and direct writes, linking each asset to both destinations.
  await forEachMedia(mediaRequests, async (request) => {
    let reference: string | undefined;
    try {
      const contentType = request.contentType;
      if (!isMediaContentType(contentType))
        throw new Error("unsupported extracted media type");
      const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
      if (!mediaBucket)
        throw new Error("Media upload bucket is not configured");
      const field = request.field;
      if (field !== "input" && field !== "output" && field !== "metadata")
        throw new Error("unsupported media field");
      const sha256Hash = request.sha256Hash;
      if (!sha256Hash) throw new Error("missing extracted media digest");
      const result = await uploadExtractedMediaOnce({
        batch,
        projectId,
        mediaBucket,
        mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
        sha256Hash,
        contentType,
        byteLengthUpperBound: request.originalByteLength,
        traceId: request.traceId,
        observationId: request.observationId,
        field,
        loadBody: () => processing.mediaBody(request.mediaIndex),
      });
      mediaBytesProcessed += result.byteLength;
      reference = request.reference.replace(
        /\|id=[^|@]+/,
        `|id=${result.mediaId}`,
      );
      recordExtractedMediaUpload(
        result.outcome,
        request.kind,
        "direct",
        result.byteLength,
        Math.max(0, request.originalByteLength - Buffer.byteLength(reference)),
      );
    } catch (error) {
      recordExtractedMediaUpload("failed", request.kind, "direct");
      logger.warn(
        "Native OTEL media upload failed; keeping the original inline value",
        {
          error,
          projectId,
          fileKey,
          observationId: request.observationId,
          field: request.field,
        },
      );
    }
    mediaResults[request.index] = { index: request.index, reference };
  });
  recordDistribution(
    "langfuse.ingestion.otel.media.batch_byte_length",
    mediaBytesProcessed,
    { write_path: "direct", media_path: "early" },
  );
  recordDistribution(
    "langfuse.ingestion.otel.media.processing_duration_ms",
    Date.now() - mediaStartedAt,
    { write_path: "direct", media_path: "early" },
  );
  return mediaResults;
}

async function resolveLookups(
  lookupRequests: OtelLookupRequest[],
  { projectId, fileKey }: OtelProcessingContext,
): Promise<object[]> {
  const prompts = new PromptService(prisma, redis);
  const skills = new SkillCacheService(prisma, redis);
  const lookups: object[] = [];
  // Resolve up to 64 lookup requests at a time; event payloads stay in Rust.
  for (let offset = 0; offset < lookupRequests.length; offset += 64) {
    lookups.push(
      ...(await Promise.all(
        lookupRequests.slice(offset, offset + 64).map(async (request) => {
          try {
            const [matched, prompt, skillReferences] = await Promise.all([
              request.modelName
                ? findModel({ projectId, model: request.modelName })
                : { model: null, pricingTiers: [] },
              request.promptName && request.promptVersion
                ? prompts.getPrompt({
                    projectId,
                    promptName: request.promptName,
                    version: request.promptVersion,
                    label: undefined,
                  })
                : null,
              resolveSkillReferences({
                projectId,
                type: request.eventType,
                service: skills,
                available: request.skillsAvailable,
                loaded: request.skillsResourceLoaded,
              }),
            ]);
            const model = matched.model;
            return {
              promptId: prompt?.id,
              model: model
                ? {
                    id: model.id,
                  }
                : null,
              pricingTiers: matched.pricingTiers.map((tier) => ({
                ...tier,
                prices: tier.prices.map((price) => ({
                  usageType: price.usageType,
                  price: price.price.toString(),
                })),
              })),
              skillsAvailable: skillReferences.skills_available,
              skillsResourceLoaded: skillReferences.skills_resource_loaded,
            };
          } catch (error) {
            traceException(error);
            logger.error(
              `Failed to create event record for project ${projectId} and observation ${request.spanId}`,
              { error, fileKey },
            );
            return { error: String(error) };
          }
        }),
      )),
    );
  }
  return lookups;
}
