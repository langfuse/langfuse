import type { EarlyOtelBatch } from "@langfuse/native";
import {
  resolveExtractedMedia,
  restoreInlineMedia,
} from "./resolveExtractedMedia";
import {
  getClickhouseEntityType,
  instrumentAsync,
  logger,
  processOtelMedia,
  recordDistribution,
  recordIncrement,
  type IngestionEventType,
  type OtelMediaPayload,
  type OtelMediaTarget,
  type OtelMediaWritePath,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { MediaAssociationOrigin } from "@langfuse/shared";

const MEDIA_FIELDS = ["input", "output", "metadata"] as const;

export type OtelMediaPresence = "present" | "absent" | "unknown";

/**
 * Worker integration point for media in normalized OTEL payloads selected for
 * persistence by the ingestion queue.
 *
 * Responsibilities:
 * - This adapter filters event shapes and owns storage configuration,
 *   instrumentation, and fail-open behavior.
 * - `processOtelMedia` iterates input/output/metadata, supplies OTEL upload
 *   context, and aggregates processing results for media still inline.
 * - `transformMediaPayload`, called by `processOtelMedia`, contains the generic
 *   Data URI/provider-shape detection and replacement algorithm. It has no
 *   knowledge of OTEL, storage, projects, or tracing.
 * - `resolveExtractedMedia` is the TypeScript resolver for references created
 *   by Rust before normalization. It uploads media whose references survive in
 *   input/output/metadata, replaces them on success, and restores failed uploads
 *   inline. TypeScript detection still runs for media Rust left inline.
 *
 * Successful replacements mutate each target payload in place. Missing storage
 * configuration is logged and skips processing. Unexpected processing errors
 * are logged and swallowed after restoring any pending references. If restoration
 * itself fails, that error propagates to avoid persisting unresolved references.
 */
export async function processOtelEventMedia(params: {
  earlyBatch?: EarlyOtelBatch;
  mediaPath?: "early" | "reference";
  targets: OtelMediaTarget[];
  writePath: OtelMediaWritePath;
  projectId: string;
  fileKey: string;
  mediaBucket?: string;
  mediaPrefix: string;
  inputByteLength?: number;
  processMedia?: typeof processOtelMedia;
}): Promise<OtelMediaPresence | undefined> {
  const {
    targets,
    writePath,
    projectId,
    fileKey,
    mediaBucket,
    mediaPrefix,
    processMedia = processOtelMedia,
  } = params;
  const mediaPath =
    params.mediaPath ?? (params.earlyBatch ? "early" : "reference");

  if (!mediaBucket) {
    logger.warn(
      "OTEL media upload is enabled but no media storage bucket is configured",
      { projectId, fileKey },
    );
    return;
  }

  if (targets.length === 0) return "absent";

  let mediaPresence: OtelMediaPresence = "unknown";
  try {
    await instrumentAsync(
      { name: "langfuse.ingestion.otel.media.process" },
      async (span) => {
        const startedAt = Date.now();
        span.setAttributes({
          "langfuse.ingestion.otel.media_path": mediaPath,
        });
        try {
          // Scan media still inline, including values below native's 1 KiB cutoff.
          // References from native extraction are resolved separately below.
          const result = await processMedia({
            targets,
            projectId,
            writePath,
            mediaPath,
            mediaBucket,
            mediaPrefix,
            uploadMedia: (uploadParams) =>
              uploadMediaForTrace({
                ...uploadParams,
                origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
              }),
          });

          if (params.earlyBatch) {
            const early = await resolveExtractedMedia({
              batch: params.earlyBatch,
              targets,
              projectId,
              mediaBucket,
              mediaPrefix,
              writePath,
            });
            result.uploaded += early.uploaded;
            result.reused += early.reused;
            result.failed += early.failed;
            result.candidates += early.candidates;
            result.bytesProcessed += early.bytesProcessed;
            result.bytesRemoved += early.bytesRemoved;
          }
          // Classify the same completed stage that contributes a duration sample.
          mediaPresence =
            result.candidates > 0 || result.failed > 0 ? "present" : "absent";

          span.setAttributes({
            "langfuse.ingestion.otel.media.uploaded": result.uploaded,
            "langfuse.ingestion.otel.media.reused": result.reused,
            "langfuse.ingestion.otel.media.invalid": result.invalid,
            "langfuse.ingestion.otel.media.ignored": result.ignored,
            "langfuse.ingestion.otel.media.failed": result.failed,
            "langfuse.ingestion.otel.media.write_path": writePath,
            "langfuse.ingestion.otel.media.candidates": result.candidates,
            "langfuse.ingestion.otel.media.bytes_processed":
              result.bytesProcessed,
            "langfuse.ingestion.otel.media.bytes_removed": result.bytesRemoved,
            "langfuse.ingestion.otel.media.detection_checks.data_uri":
              result.detectionChecks.data_uri,
            "langfuse.ingestion.otel.media.detection_checks.stringified_json":
              result.detectionChecks.stringified_json,
            "langfuse.ingestion.otel.media.detection_checks.structured_payload":
              result.detectionChecks.structured_payload,
            "langfuse.ingestion.otel.media.detection_checked_bytes.data_uri":
              result.detectionCheckedBytes.data_uri,
            "langfuse.ingestion.otel.media.detection_checked_bytes.stringified_json":
              result.detectionCheckedBytes.stringified_json,
            "langfuse.ingestion.otel.media.detection_checked_bytes.structured_payload":
              result.detectionCheckedBytes.structured_payload,
          });

          recordDistribution(
            "langfuse.ingestion.otel.media.batch_byte_length",
            result.bytesProcessed,
            { write_path: writePath, media_path: mediaPath },
          );
          recordDistribution(
            "langfuse.ingestion.otel.media.batch_checked_byte_length",
            Object.values(result.detectionCheckedBytes).reduce(
              (total, bytes) => total + bytes,
              0,
            ),
            { write_path: writePath, media_path: mediaPath },
          );
        } finally {
          recordMediaStageMetrics({
            durationMs: Date.now() - startedAt,
            writePath,
            mediaPath,
            mediaPresence,
            inputByteLength: params.inputByteLength,
          });
        }
      },
    );
    return mediaPresence;
  } catch (error) {
    if (params.earlyBatch) {
      // Unexpected detector failures must not leave pending references in persisted payloads.
      await restoreInlineMedia(
        params.earlyBatch,
        targets.map(({ payload }) => payload),
        {
          includePayloads: true,
        },
      );
    }
    logger.warn(
      "OTEL media processing failed; continuing ingestion with original span values",
      { projectId, fileKey, error },
    );
    return "unknown";
  }
}

function recordMediaStageMetrics(params: {
  durationMs: number;
  writePath: OtelMediaWritePath;
  mediaPath: "early" | "reference";
  mediaPresence: "present" | "absent" | "unknown";
  inputByteLength?: number;
}): void {
  const tags = {
    write_path: params.writePath,
    media_path: params.mediaPath,
    media_presence: params.mediaPresence,
  };
  recordDistribution(
    "langfuse.ingestion.otel.media.processing_duration_ms",
    params.durationMs,
    tags,
  );
  recordIncrement("langfuse.ingestion.otel.media.processing_sample", 1, tags);
  recordIncrement(
    "langfuse.ingestion.otel.media.processing_duration_total_ms",
    params.durationMs,
    tags,
  );
  if (params.inputByteLength && params.inputByteLength > 0) {
    // Dual writes contribute both their input bytes and stage time.
    recordIncrement(
      "langfuse.ingestion.otel.media.input_bytes_total",
      params.inputByteLength,
      tags,
    );
  }
}

/**
 * Creates media targets for direct events-table inputs without cloning their
 * potentially large input, output, or metadata values.
 */
export function createDirectOtelMediaTargets(
  eventInputs: unknown[],
): OtelMediaTarget[] {
  const targets: OtelMediaTarget[] = [];
  for (const value of eventInputs) {
    if (!isRecordWithMediaFields(value)) continue;
    if (typeof value.traceId !== "string" || typeof value.spanId !== "string") {
      continue;
    }
    targets.push({
      traceId: value.traceId,
      observationId: value.spanId,
      payload: value,
    });
  }
  return targets;
}

/**
 * Creates media targets for normalized legacy trace and observation events.
 *
 * The returned targets reference each event's existing `body`; successful
 * replacements therefore reach both legacy persistence and event forwarding
 * without copying or synchronizing large payloads.
 */
export function createLegacyOtelMediaTargets(
  events: IngestionEventType[],
): OtelMediaTarget[] {
  const targets: OtelMediaTarget[] = [];
  for (const event of events) {
    const body: unknown = event.body;
    if (!isRecordWithMediaFields(body)) continue;

    const entityType = getClickhouseEntityType(event.type);
    if (entityType === "trace" && typeof body.id === "string") {
      targets.push({ traceId: body.id, payload: body });
      continue;
    }
    if (
      entityType === "observation" &&
      typeof body.traceId === "string" &&
      typeof body.id === "string"
    ) {
      targets.push({
        traceId: body.traceId,
        observationId: body.id,
        payload: body,
      });
    }
  }
  return targets;
}

function isRecordWithMediaFields(
  value: unknown,
): value is Record<string, unknown> & OtelMediaPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return MEDIA_FIELDS.some((field) => record[field] != null);
}
