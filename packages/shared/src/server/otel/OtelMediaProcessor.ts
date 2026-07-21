import type { MediaContentType, MediaField } from "../../domain/media";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import {
  transformMediaPayload,
  type MediaDetectionPath,
  type MediaPayloadCandidate,
  type MediaPayloadKind,
} from "../media/MediaPayloadProcessor";
import type { UploadMediaForTraceResult } from "../media/mediaService";

export type OtelMediaKind = MediaPayloadKind;

/**
 * Points at one normalized OTEL field that may contain embedded media.
 *
 * `body` is intentionally retained by reference. {@link processOtelMedia}
 * mutates `body[field]` in place after each embedded media item has been
 * uploaded successfully, so downstream ingestion persists media references.
 */
export type OtelMediaTarget = {
  traceId: string;
  observationId?: string;
  field: MediaField;
  body: Record<string, unknown>;
};

export type UploadOtelMedia = (params: {
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  contentType: MediaContentType;
  contentBytes: Buffer;
  mediaBucket: string;
  mediaPrefix: string;
}) => Promise<UploadMediaForTraceResult>;

/** Aggregate outcome and workload counters for one OTEL media-processing run. */
export type OtelMediaProcessResult = {
  /** Candidates newly uploaded to media storage. */
  uploaded: number;
  /** Candidates already present in media storage and linked without uploading. */
  reused: number;
  /** Values matching a media shape but failing MIME type or base64 validation. */
  invalid: number;
  /** Valid candidates whose upload or media-link operation failed. */
  failed: number;
  /**
   * UTF-8 byte difference between original and transformed values. For
   * stringified JSON this also includes whitespace removed by reserialization.
   */
  bytesRemoved: number;
  /** Valid, non-empty candidates decoded and submitted to the upload service. */
  candidates: number;
  /** Total decoded binary bytes across all valid candidates. */
  bytesProcessed: number;
  /** Number of times each detection algorithm was entered. */
  detectionChecks: Record<MediaDetectionPath, number>;
  /**
   * UTF-8 bytes inspected by each detection algorithm. The same source bytes
   * may be counted under multiple paths, for example Data URI replacement
   * followed by stringified-JSON processing.
   */
  detectionCheckedBytes: Record<MediaDetectionPath, number>;
};

type ProcessContext = {
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
  result: OtelMediaProcessResult;
};

/**
 * Detects and uploads embedded media for a set of normalized OTEL fields.
 *
 * Targets and candidates are processed sequentially to bound peak decoded
 * media memory. Successful replacements mutate each target's `body` in place.
 * Invalid values and failed uploads are left unchanged; their outcomes are
 * reflected in the returned counters instead of failing the whole run.
 */
export async function processOtelMedia(params: {
  targets: OtelMediaTarget[];
  projectId: string;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
}): Promise<OtelMediaProcessResult> {
  const { targets, projectId, mediaBucket, mediaPrefix, uploadMedia } = params;
  const result: OtelMediaProcessResult = {
    uploaded: 0,
    reused: 0,
    invalid: 0,
    failed: 0,
    bytesRemoved: 0,
    candidates: 0,
    bytesProcessed: 0,
    detectionChecks: {
      data_uri: 0,
      stringified_json: 0,
      structured_payload: 0,
    },
    detectionCheckedBytes: {
      data_uri: 0,
      stringified_json: 0,
      structured_payload: 0,
    },
  };
  for (const target of targets) {
    const originalValue = target.body[target.field];
    if (originalValue == null) continue;

    const context: ProcessContext = {
      projectId,
      traceId: target.traceId,
      observationId: target.observationId,
      field: target.field,
      mediaBucket,
      mediaPrefix,
      uploadMedia,
      result,
    };
    const transformed = await transformMediaPayload(originalValue, {
      processCandidate: (candidate) => processCandidate(candidate, context),
      onInvalidCandidate: (kind) => recordInvalidCandidate(kind, context),
      onDetectionPath: (path, checkedBytes) =>
        recordDetectionCheck(path, checkedBytes, context),
    });

    // Structured objects are mutated by transformMediaPayload itself and keep
    // their identity. Strings instead return a new value that must be assigned.
    if (transformed.value !== originalValue) {
      target.body[target.field] = transformed.value;
    }
    if (transformed.bytesRemoved > 0) {
      result.bytesRemoved += transformed.bytesRemoved;
      recordDistribution(
        "langfuse.ingestion.otel.media.bytes_removed",
        transformed.bytesRemoved,
      );
    }
  }

  return result;
}

async function processCandidate(
  candidate: MediaPayloadCandidate,
  context: ProcessContext,
): Promise<string | undefined> {
  // Base64 decoding and hashing are synchronous and may be expensive for large
  // media. Yield between candidates so a batch with many items does not hold
  // the worker event loop continuously. Processing remains sequential to bound
  // the number of decoded Buffers retained at once.
  await new Promise<void>((resolve) => setImmediate(resolve));

  let contentBytes: Buffer;
  try {
    contentBytes = Buffer.from(candidate.base64Data, "base64");
    if (contentBytes.length === 0) {
      recordInvalidCandidate(candidate.kind, context);
      return;
    }
  } catch {
    recordInvalidCandidate(candidate.kind, context);
    return;
  }

  context.result.candidates += 1;
  context.result.bytesProcessed += contentBytes.length;

  try {
    const uploadResult = await context.uploadMedia({
      projectId: context.projectId,
      traceId: context.traceId,
      observationId: context.observationId,
      field: context.field,
      contentType: candidate.contentType,
      contentBytes,
      mediaBucket: context.mediaBucket,
      mediaPrefix: context.mediaPrefix,
    });

    context.result[uploadResult.outcome] += 1;
    recordIncrement("langfuse.ingestion.otel.media", 1, {
      outcome: uploadResult.outcome,
      media_kind: candidate.kind,
    });
    recordDistribution(
      "langfuse.ingestion.otel.media.byte_length",
      contentBytes.length,
      { media_kind: candidate.kind },
    );

    return `@@@langfuseMedia:type=${candidate.contentType}|id=${uploadResult.mediaId}|source=${candidate.source}@@@`;
  } catch (error) {
    context.result.failed += 1;
    recordIncrement("langfuse.ingestion.otel.media", 1, {
      outcome: "failed",
      media_kind: candidate.kind,
    });
    logger.warn(
      "OTEL media upload failed; leaving normalized value unchanged",
      {
        projectId: context.projectId,
        traceId: context.traceId,
        observationId: context.observationId,
        field: context.field,
        mediaKind: candidate.kind,
        mediaBytes: contentBytes.length,
        error,
      },
    );
  }
}

function recordDetectionCheck(
  path: MediaDetectionPath,
  checkedBytes: number,
  context: ProcessContext,
): void {
  context.result.detectionChecks[path] += 1;
  context.result.detectionCheckedBytes[path] += checkedBytes;
  recordIncrement("langfuse.ingestion.otel.media.detection_check", 1, {
    path,
  });
  recordDistribution(
    "langfuse.ingestion.otel.media.detection_check_byte_length",
    checkedBytes,
    { path },
  );
}

function recordInvalidCandidate(
  kind: MediaPayloadKind,
  context: ProcessContext,
): void {
  context.result.invalid += 1;
  recordIncrement("langfuse.ingestion.otel.media", 1, {
    outcome: "invalid",
    media_kind: kind,
  });
}
