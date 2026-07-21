import {
  instrumentAsync,
  logger,
  processOtelMedia,
  recordDistribution,
  type OtelMediaEvent,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

const MEDIA_FIELDS = ["input", "output", "metadata"] as const;

/**
 * Runs instrumented media processing for normalized OTEL events that will be
 * written directly to the events table.
 *
 * Successful replacements mutate each event in place. Missing storage
 * configuration or unexpected processing errors are logged and swallowed so
 * media extraction cannot reject the enclosing OTEL ingestion job.
 */
export async function processOtelEventMedia(params: {
  eventInputs: unknown[];
  projectId: string;
  fileKey: string;
  mediaBucket?: string;
  mediaPrefix: string;
  processMedia?: typeof processOtelMedia;
}): Promise<void> {
  const {
    eventInputs,
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

  const events = eventInputs.filter(isOtelMediaEvent);
  if (events.length === 0) return;

  try {
    await instrumentAsync(
      { name: "langfuse.ingestion.otel.media.process" },
      async (span) => {
        const startedAt = Date.now();
        try {
          const result = await processMedia({
            events,
            projectId,
            mediaBucket,
            mediaPrefix,
            uploadMedia: uploadMediaForTrace,
          });

          span.setAttributes({
            "langfuse.ingestion.otel.media.uploaded": result.uploaded,
            "langfuse.ingestion.otel.media.reused": result.reused,
            "langfuse.ingestion.otel.media.invalid": result.invalid,
            "langfuse.ingestion.otel.media.failed": result.failed,
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
          );
          recordDistribution(
            "langfuse.ingestion.otel.media.batch_checked_byte_length",
            Object.values(result.detectionCheckedBytes).reduce(
              (total, bytes) => total + bytes,
              0,
            ),
          );
        } finally {
          recordDistribution(
            "langfuse.ingestion.otel.media.processing_duration_ms",
            Date.now() - startedAt,
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

function isOtelMediaEvent(value: unknown): value is OtelMediaEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event.traceId === "string" &&
    typeof event.spanId === "string" &&
    MEDIA_FIELDS.some((field) => event[field] != null)
  );
}
