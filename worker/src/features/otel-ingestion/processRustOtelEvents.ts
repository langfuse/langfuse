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
  completeObservationForEval,
  convertEventRecordToObservationEvalFilterFields,
  isMediaContentType,
  MediaAssociationOrigin,
  observationEvalFilterRecordColumns,
  MediaContentType,
  type MediaField,
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
import { encodeOtelLookups, type OtelLookupResult } from "./encodeOtelLookups";
import {
  createEvalSchedulerDeps,
  scheduleEvals,
} from "../evaluation/scheduleEvals";
import {
  isTraceDispatchSampled,
  resolveTraceDispatchSamplingRate,
} from "../traceDispatch/traceDispatchSampling";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";
import type { OtelMediaPresence } from "../otel-media/processOtelMedia";
import {
  recordExtractedMediaUpload,
  uploadExtractedMediaOnce,
} from "../otel-media/resolveExtractedMedia";
import {
  type NativeOtelLookupServices,
  type NativeOtelMediaSuccess,
  type NativeOtelProcessingEffects,
  type NativeOtelUploadRequest,
} from "./nativeOtelShadowEffects";
import {
  emitOtelEffect,
  emitOtelOperationFailure,
  getOtelCaptureErrorType,
} from "./otelEffectsCapture";

type EvalRuleResolution = {
  traceDispatchSamplingRate: number;
  sampledTraceIds: string[];
  evalConfigs: EvalRules;
};

type FinalizedEvent = FinalizedOtelBatch["events"][number];

type SuccessfulNativeOtelUpload = NativeOtelMediaSuccess;

function createProductionLookupServices(): NativeOtelLookupServices {
  return {
    findModel,
    prompts: new PromptService(prisma, redis),
    skills: new SkillCacheService(prisma, redis),
  };
}

function recordOverflowMetrics({
  request,
  reference,
  outcome,
}: {
  request: OtelOverflowRequest;
  reference?: string;
  outcome: string;
}): void {
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
}

function recordMediaBatchMetrics({
  bytesProcessed,
  durationMs,
}: {
  bytesProcessed: number;
  durationMs: number;
}): void {
  recordDistribution(
    "langfuse.ingestion.otel.media.batch_byte_length",
    bytesProcessed,
    { write_path: "direct", media_path: "early" },
  );
  recordDistribution(
    "langfuse.ingestion.otel.media.processing_duration_ms",
    durationMs,
    { write_path: "direct", media_path: "early" },
  );
}

function createProductionEffects(
  batch: EarlyOtelBatch,
  { projectId }: OtelProcessingContext,
): NativeOtelProcessingEffects {
  const writer = ClickhouseWriter.getNativeInstance();
  return {
    uploadMedia: async (request) => {
      const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
      if (!mediaBucket) {
        throw new Error("Media upload bucket is not configured");
      }

      if (request.kind === "media") {
        const result = await uploadExtractedMediaOnce({
          batch,
          projectId,
          mediaBucket,
          mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
          sha256Hash: request.identity.sha256Hash,
          contentType: request.identity.contentType as MediaContentType,
          byteLengthUpperBound: request.byteLengthUpperBound,
          traceId: request.identity.traceId,
          observationId: request.identity.observationId,
          field: request.identity.field,
          loadBody: request.loadBody,
        });
        return {
          ...result,
          cacheHit: result.outcome === "reused",
        };
      }

      const contentBytes = await request.loadBody();
      const result = await otelMediaUploads.run(
        request.byteLengthUpperBound,
        () =>
          uploadMediaForTrace({
            projectId,
            traceId: request.identity.traceId,
            observationId: request.identity.observationId,
            field: request.identity.field,
            contentType: request.identity.contentType as MediaContentType,
            contentBytes,
            sha256Hash: request.identity.sha256Hash,
            mediaBucket,
            mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
            origin: request.identity.origin,
          }),
      );
      return { ...result, byteLength: contentBytes.length };
    },
    writeEvent: (event) => writer.addToQueue(TableName.EventsFull, event),
    createEvalSchedulerDeps,
    recordIngestionCounts,
    recordOverflowMetrics,
    recordMediaBatchMetrics,
    recordExtractedMediaUpload: (outcome, kind, byteLength, bytesRemoved) =>
      recordExtractedMediaUpload(
        outcome,
        kind,
        "direct",
        byteLength,
        bytesRemoved,
      ),
  };
}

async function uploadNativeOtelMedia(
  effects: NativeOtelProcessingEffects,
  request: NativeOtelUploadRequest,
  decorate?: (result: SuccessfulNativeOtelUpload) => SuccessfulNativeOtelUpload,
): Promise<SuccessfulNativeOtelUpload> {
  try {
    const result = await effects.uploadMedia(request);
    if (effects.capture) {
      emitOtelEffect(effects.capture, {
        ...request.identity,
        mediaPath: request.kind === "media" ? "early" : "reference",
        request: { byteLengthUpperBound: request.byteLengthUpperBound },
        result: decorate ? decorate(result) : result,
      });
    }
    return result;
  } catch (error) {
    if (effects.capture) {
      emitOtelEffect(effects.capture, {
        ...request.identity,
        mediaPath: request.kind === "media" ? "early" : "reference",
        request: { byteLengthUpperBound: request.byteLengthUpperBound },
        result: {
          outcome: "failed",
          error: { type: getOtelCaptureErrorType(error) },
        },
      });
    }
    throw error;
  }
}

/**
 * Processes a native OTEL batch through service lookups, native completion,
 * evaluation scheduling, and the ClickHouse writer.
 */
export async function processRustOtelEvents(params: {
  batch: EarlyOtelBatch;
  context: OtelProcessingContext;
  effects?: NativeOtelProcessingEffects;
}): Promise<OtelMediaPresence> {
  const { batch, context } = params;
  const { projectId } = context;
  const effects = params.effects ?? createProductionEffects(batch, context);
  const samplingRate =
    effects.traceDispatchSamplingRate !== undefined
      ? Promise.resolve(effects.traceDispatchSamplingRate)
      : resolveProductionTraceDispatchSamplingRate(projectId);
  const prepared = await batch.process(context);
  const processing = prepared.batch;
  try {
    const [mediaResults, lookups, rules] = await waitForServiceWork([
      uploadRequestedMedia(
        batch,
        processing,
        prepared.mediaRequests,
        context,
        effects,
      ),
      resolveLookups(
        prepared.lookupRequests,
        context,
        effects.lookupServices,
        effects,
      ),
      fetchSampledEvalRules(
        projectId,
        prepared.traceIds,
        samplingRate,
        effects.evalRules,
      ),
    ] as const);
    const finalized = await completeOrFinalizeBatch(
      processing,
      mediaResults,
      lookups,
      rules,
      projectId,
      effects,
    );
    await writeRecordsAndScheduleEvals(
      processing,
      finalized,
      rules,
      context,
      effects,
    );
    return prepared.mediaRequests.length > 0 ? "present" : "absent";
  } finally {
    await processing.dispose();
  }
}

function resolveProductionTraceDispatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (!isEventsDispatchEnabled()) return Promise.resolve(0);
  return resolveTraceDispatchSamplingRate(projectId);
}

function fetchSampledEvalRules(
  projectId: string,
  traceIds: string[],
  traceDispatchSamplingRatePromise: Promise<number>,
  preparedRules?: EvalRules,
): Promise<EvalRuleResolution> {
  return traceDispatchSamplingRatePromise.then(
    async (traceDispatchSamplingRate) => {
      // Select transcript rules using `process`'s trace IDs. Pass selected IDs to
      // `complete`/`finalize` to measure rows after oversized fields are replaced.
      const sampledTraceIds = traceIds.filter((traceId) =>
        isTraceDispatchSampled(traceId, traceDispatchSamplingRate),
      );
      const evalConfigs = preparedRules
        ? preparedRules
        : await fetchEvalRules(projectId, {
            includeTraceTranscriptRules: sampledTraceIds.length > 0,
          }).catch((error) => {
            traceException(error);
            logger.warn(
              `Failed to fetch eval rules for project ${projectId}`,
              error,
            );
            return { observationRules: [], traceTranscriptRules: [] };
          });
      return { traceDispatchSamplingRate, sampledTraceIds, evalConfigs };
    },
  );
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
  lookups: OtelLookupResult[],
  { evalConfigs, sampledTraceIds }: EvalRuleResolution,
  projectId: string,
  effects: NativeOtelProcessingEffects,
): Promise<FinalizedOtelBatch> {
  const overflowLimitBytes =
    env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED === "true"
      ? env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES
      : undefined;
  // With rules, Rust returns these columns of every row for matching.
  const evaluationFilterColumns =
    evalConfigs.observationRules.length > 0 ||
    evalConfigs.traceTranscriptRules.length > 0
      ? observationEvalFilterRecordColumns
      : undefined;
  const traceActivityIds =
    sampledTraceIds.length > 0 ? sampledTraceIds : undefined;
  const completion = await processing.complete(
    mediaResults,
    encodeOtelLookups(lookups),
    overflowLimitBytes,
    evaluationFilterColumns,
    traceActivityIds,
  );
  if (completion.finalized) {
    return completion.finalized;
  }

  const overflowResults = await uploadOverflowFields(
    processing,
    completion.overflowRequests,
    projectId,
    effects,
  );
  return processing.finalize(
    overflowResults,
    evaluationFilterColumns,
    traceActivityIds,
  );
}

async function uploadOverflowFields(
  processing: RustOtelBatch,
  requests: OtelOverflowRequest[],
  projectId: string,
  effects: NativeOtelProcessingEffects,
): Promise<OtelMediaResolution[]> {
  const overflowResults = new Array<OtelMediaResolution>(requests.length);
  await forEachMedia(requests, async (request) => {
    let reference: string | undefined;
    let outcome = "failed";
    try {
      const field = request.field as MediaField;
      if (field !== "input" && field !== "output" && field !== "metadata")
        throw new Error("unsupported overflow field");
      const sha256Hash = request.sha256Hash;
      if (!sha256Hash) throw new Error("missing overflow media digest");
      const identity = {
        kind: "media" as const,
        projectId,
        traceId: request.traceId,
        observationId: request.observationId,
        field,
        contentType: MediaContentType.TXT,
        sha256Hash,
        origin: MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW,
        writePath: "direct" as const,
        mediaPath: "reference" as const,
      };
      const result = await uploadNativeOtelMedia(
        effects,
        {
          kind: "overflow",
          identity,
          byteLengthUpperBound: request.byteLength,
          loadBody: () => processing.overflowBody(request.index),
        },
        (upload) => ({
          ...upload,
          bytesRemoved: Math.max(
            request.byteLength -
              Buffer.byteLength(
                `@@@langfuseMedia:type=text/plain|id=${upload.mediaId}|source=field_size_limit@@@`,
              ),
            0,
          ),
        }),
      );
      reference = `@@@langfuseMedia:type=text/plain|id=${result.mediaId}|source=field_size_limit@@@`;
      outcome = result.outcome;
    } catch (error) {
      if (effects.capture && !reference) {
        emitOtelOperationFailure(effects.capture, {
          operation: "native-overflow-upload",
          mode: effects.captureMode ?? "simulated",
          projectId,
          traceId: request.traceId,
          observationId: request.observationId,
          error,
        });
      }
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
    effects.recordOverflowMetrics({ request, reference, outcome });
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

type EvaluationFilterRow = Parameters<
  typeof convertEventRecordToObservationEvalFilterFields
>[0];

/**
 * Parse the columns that evaluation rule filters read, one row per event. They
 * carry no input or output; Rust keeps the full rows until a rule selects one.
 */
function parseEvaluationFilterRows(
  texts: string[] | undefined,
): EvaluationFilterRow[] {
  return (
    texts?.flatMap((text): EvaluationFilterRow[] => JSON.parse(text)) ?? []
  );
}

/** Validate an event's filter fields; load the rest of its row once a rule selects it. */
function observationForScheduling(
  processing: RustOtelBatch,
  filterRow: EvaluationFilterRow,
  index: number,
) {
  const filterFields =
    convertEventRecordToObservationEvalFilterFields(filterRow);
  return {
    observation: filterFields,
    // The taken row holds the columns the filter row lacks.
    loadSnapshot: () =>
      completeObservationForEval(
        filterFields,
        processing.takeEvaluationRow(index) as EventRecordInsertType,
      ),
  };
}

async function writeRecordsAndScheduleEvals(
  processing: RustOtelBatch,
  { events: records, evaluationFilterRows }: FinalizedOtelBatch,
  {
    traceDispatchSamplingRate,
    sampledTraceIds,
    evalConfigs,
  }: EvalRuleResolution,
  { projectId, fileKey }: OtelProcessingContext,
  effects: NativeOtelProcessingEffects,
): Promise<void> {
  const needsScheduler =
    evalConfigs.observationRules.length > 0 || sampledTraceIds.length > 0;
  const schedulerDeps = needsScheduler
    ? effects.createEvalSchedulerDeps(projectId, evalConfigs)
    : null;
  const filterRows = schedulerDeps
    ? parseEvaluationFilterRows(evaluationFilterRows)
    : [];
  effects.recordIngestionCounts(records);
  await Promise.all(
    records.map(async (record, index) => {
      const traceActivity = isTraceDispatchSampled(
        record.traceId,
        traceDispatchSamplingRate,
      )
        ? {
            traceId: record.traceId,
            spanStartTimeISO: record.startTimeIso,
          }
        : undefined;
      const matchedRuleIds = schedulerDeps
        ? await scheduleEvals({
            parseObservation: () => {
              try {
                const parsed = observationForScheduling(
                  processing,
                  filterRows[index],
                  index,
                );
                return {
                  observation: parsed.observation,
                  loadSnapshot: () => {
                    try {
                      return parsed.loadSnapshot();
                    } catch (error) {
                      emitOtelOperationFailure(effects.capture, {
                        operation: "observation-normalization",
                        mode: effects.captureMode ?? "simulated",
                        projectId,
                        traceId: record.traceId,
                        observationId: record.event.ids.id,
                        error,
                      });
                      throw error;
                    }
                  },
                };
              } catch (error) {
                emitOtelOperationFailure(effects.capture, {
                  operation: "observation-normalization",
                  mode: effects.captureMode ?? "simulated",
                  projectId,
                  traceId: record.traceId,
                  observationId: record.event.ids.id,
                  error,
                });
                throw error;
              }
            },
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
        effects.writeEvent(record.event, record.startTimeIso);
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
        emitOtelOperationFailure(effects.capture, {
          operation: "direct-row-write",
          mode: effects.captureMode ?? "simulated",
          projectId,
          traceId: record.traceId,
          observationId: record.event.ids.id,
          error,
        });
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
  effects: NativeOtelProcessingEffects,
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
      const field = request.field as MediaField;
      if (field !== "input" && field !== "output" && field !== "metadata")
        throw new Error("unsupported media field");
      const sha256Hash = request.sha256Hash;
      if (!sha256Hash) throw new Error("missing extracted media digest");
      const identity = {
        kind: "media" as const,
        projectId,
        traceId: request.traceId,
        observationId: request.observationId,
        field,
        contentType,
        sha256Hash,
        origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
        writePath: "direct" as const,
        mediaPath: "early" as const,
      };
      const result = await uploadNativeOtelMedia(
        effects,
        {
          kind: "media",
          identity,
          byteLengthUpperBound: request.originalByteLength,
          loadBody: () => processing.mediaBody(request.mediaIndex),
        },
        (upload) => ({
          ...upload,
          bytesRemoved: Math.max(
            0,
            request.originalByteLength -
              Buffer.byteLength(
                request.reference.replace(
                  /\|id=[^|@]+/,
                  `|id=${upload.mediaId}`,
                ),
              ),
          ),
        }),
      );
      mediaBytesProcessed += result.byteLength ?? 0;
      reference = request.reference.replace(
        /\|id=[^|@]+/,
        `|id=${result.mediaId}`,
      );
      effects.recordExtractedMediaUpload(
        result.outcome,
        request.kind,
        result.byteLength,
        Math.max(0, request.originalByteLength - Buffer.byteLength(reference)),
      );
    } catch (error) {
      effects.recordExtractedMediaUpload("failed", request.kind);
      emitOtelOperationFailure(effects.capture, {
        operation: "native-media-upload",
        mode: effects.captureMode ?? "simulated",
        projectId,
        traceId: request.traceId,
        observationId: request.observationId,
        error,
      });
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
  effects.recordMediaBatchMetrics({
    bytesProcessed: mediaBytesProcessed,
    durationMs: Date.now() - mediaStartedAt,
  });
  return mediaResults;
}

async function resolveLookups(
  lookupRequests: OtelLookupRequest[],
  context: OtelProcessingContext,
  services?: NativeOtelLookupServices,
  effects?: NativeOtelProcessingEffects,
): Promise<OtelLookupResult[]> {
  const { projectId, fileKey } = context;
  const lookupServices = services ?? createProductionLookupServices();
  const lookups: OtelLookupResult[] = [];
  // Resolve up to 64 lookup requests at a time; event payloads stay in Rust.
  for (let offset = 0; offset < lookupRequests.length; offset += 64) {
    lookups.push(
      ...(await Promise.all(
        lookupRequests.slice(offset, offset + 64).map(async (request) => {
          try {
            const [matched, prompt, skillReferences] = await Promise.all([
              request.modelName
                ? lookupServices.findModel({
                    projectId,
                    model: request.modelName,
                  })
                : { model: null, pricingTiers: [] },
              request.promptName && request.promptVersion
                ? lookupServices.prompts.getPrompt({
                    projectId,
                    promptName: request.promptName,
                    version: request.promptVersion,
                    label: undefined,
                  })
                : null,
              resolveSkillReferences({
                projectId,
                type: request.eventType,
                service: lookupServices.skills,
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
            emitOtelOperationFailure(effects?.capture, {
              operation: "native-lookup",
              mode: effects?.captureMode ?? "simulated",
              projectId,
              observationId: request.spanId,
              error,
            });
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
