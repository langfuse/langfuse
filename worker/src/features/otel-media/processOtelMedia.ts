import {
  getClickhouseEntityType,
  instrumentAsync,
  logger,
  processOtelMedia,
  recordDistribution,
  type IngestionEventType,
  type OtelMediaPayload,
  type OtelMediaTarget,
  type OtelMediaWritePath,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

const MEDIA_FIELDS = ["input", "output", "metadata"] as const;

/**
 * Worker integration point for media in normalized OTEL payloads selected for
 * persistence by the ingestion queue.
 *
 * Responsibilities are split across three layers:
 * - This adapter filters event shapes and owns storage configuration,
 *   instrumentation, and fail-open behavior.
 * - `processOtelMedia` iterates input/output/metadata, supplies OTEL upload
 *   context, and aggregates processing results.
 * - `transformMediaPayload`, called by `processOtelMedia`, contains the generic
 *   Data URI/provider-shape detection and replacement algorithm. It has no
 *   knowledge of OTEL, storage, projects, or tracing.
 *
 * Successful replacements mutate each target payload in place. Missing storage
 * configuration or unexpected processing errors are logged and swallowed so
 * media extraction cannot reject the enclosing OTEL ingestion job.
 */
export async function processOtelEventMedia(params: {
  targets: OtelMediaTarget[];
  writePath: OtelMediaWritePath;
  projectId: string;
  fileKey: string;
  mediaBucket?: string;
  mediaPrefix: string;
  processMedia?: typeof processOtelMedia;
}): Promise<void> {
  const {
    targets,
    writePath,
    projectId,
    fileKey,
    mediaBucket,
    mediaPrefix,
    processMedia = processOtelMedia,
  } = params;

  if (!mediaBucket) {
    logger.warn(
      "OTEL media upload is enabled but no media storage bucket is configured",
      { projectId, fileKey },
    );
    return;
  }

  if (targets.length === 0) return;

  try {
    await instrumentAsync(
      { name: "langfuse.ingestion.otel.media.process" },
      async (span) => {
        const startedAt = Date.now();
        try {
          const result = await processMedia({
            targets,
            projectId,
            writePath,
            mediaBucket,
            mediaPrefix,
            uploadMedia: uploadMediaForTrace,
          });

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
            { write_path: writePath },
          );
          recordDistribution(
            "langfuse.ingestion.otel.media.batch_checked_byte_length",
            Object.values(result.detectionCheckedBytes).reduce(
              (total, bytes) => total + bytes,
              0,
            ),
            { write_path: writePath },
          );
        } finally {
          recordDistribution(
            "langfuse.ingestion.otel.media.processing_duration_ms",
            Date.now() - startedAt,
            { write_path: writePath },
          );
        }
      },
    );
  } catch (error) {
    logger.warn(
      "OTEL media processing failed; continuing ingestion with original span values",
      { projectId, fileKey, error },
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
