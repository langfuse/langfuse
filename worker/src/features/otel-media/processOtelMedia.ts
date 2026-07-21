import {
  getClickhouseEntityType,
  instrumentAsync,
  logger,
  processOtelMedia,
  recordDistribution,
  type IngestionEventType,
  type OtelMediaTarget,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

const MEDIA_FIELDS = ["input", "output", "metadata"] as const;

/**
 * Returns whether the normalized event representation will be persisted
 * directly and therefore needs media replacement before event records are
 * created. Eval-only payloads are prepared later, after filter and sampling
 * checks confirm that the observation will be uploaded.
 */
export function shouldProcessOtelEventInputMedia(params: {
  enabled: boolean;
  shouldWriteToEventsTable: boolean;
}): boolean {
  return params.enabled && params.shouldWriteToEventsTable;
}

/**
 * Builds mutable field references for the normalized OTEL representations that
 * the caller intends to persist. This function does not mutate the supplied
 * events, but each target retains its original `body` reference so subsequent
 * media processing updates the payload consumed by downstream ingestion.
 */
export function createOtelMediaTargets(params: {
  ingestionEvents: IngestionEventType[];
  eventInputs: unknown[];
}): OtelMediaTarget[] {
  const targets: OtelMediaTarget[] = [];

  for (const event of params.ingestionEvents) {
    const body: unknown = event.body;
    if (!isObject(body)) continue;

    const entityType = getClickhouseEntityType(event.type);
    if (entityType !== "trace" && entityType !== "observation") continue;

    const traceId = entityType === "trace" ? body.id : body.traceId;
    const observationId = entityType === "observation" ? body.id : undefined;
    if (
      typeof traceId !== "string" ||
      (observationId !== undefined && typeof observationId !== "string")
    ) {
      continue;
    }

    addMediaTargets({
      targets,
      body,
      traceId,
      observationId,
    });
  }

  for (const eventInput of params.eventInputs) {
    if (
      !isObject(eventInput) ||
      typeof eventInput.traceId !== "string" ||
      typeof eventInput.spanId !== "string"
    ) {
      continue;
    }

    addMediaTargets({
      targets,
      body: eventInput,
      traceId: eventInput.traceId,
      observationId: eventInput.spanId,
    });
  }

  return targets;
}

/**
 * Builds media targets for one already-normalized body. The function itself
 * does not mutate `body`; returned targets retain its reference, so processing
 * those targets later mutates the body's input, output, and metadata fields.
 */
export function createOtelMediaTargetsForBody(params: {
  body: Record<string, unknown>;
  traceId: string;
  observationId?: string;
}): OtelMediaTarget[] {
  const targets: OtelMediaTarget[] = [];
  addMediaTargets({ targets, ...params });
  return targets;
}

function addMediaTargets(params: {
  targets: OtelMediaTarget[];
  body: Record<string, unknown>;
  traceId: string;
  observationId?: string;
}): void {
  for (const field of MEDIA_FIELDS) {
    if (params.body[field] == null) continue;
    params.targets.push({
      traceId: params.traceId,
      observationId: params.observationId,
      field,
      body: params.body,
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runs instrumented OTEL media processing when configured.
 *
 * Successful replacements mutate each target body in place. Missing storage
 * configuration or unexpected processing errors are logged and swallowed so
 * media extraction cannot reject the enclosing OTEL ingestion job.
 */
export async function processOtelMediaIfEnabled(params: {
  enabled: boolean;
  targets: OtelMediaTarget[];
  projectId: string;
  fileKey: string;
  mediaBucket?: string;
  mediaPrefix: string;
  processMedia?: typeof processOtelMedia;
}): Promise<void> {
  const {
    enabled,
    targets,
    projectId,
    fileKey,
    mediaBucket,
    mediaPrefix,
    processMedia = processOtelMedia,
  } = params;

  if (!enabled) return;

  if (!mediaBucket) {
    logger.warn(
      "OTEL media upload is enabled but no media storage bucket is configured",
      { projectId, fileKey },
    );
    return;
  }

  try {
    await instrumentAsync(
      { name: "langfuse.ingestion.otel.media.process" },
      async (span) => {
        const startedAt = Date.now();
        try {
          const result = await processMedia({
            targets,
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
