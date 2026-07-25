import type { MediaContentType, MediaField } from "../../domain/media";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import {
  transformMediaPayload,
  type MediaDetectionPath,
  type MediaIgnoredReason,
  type MediaInvalidReason,
  type MediaPayloadCandidate,
  type MediaPayloadKind,
} from "../media/MediaPayloadProcessor";
import type { UploadMediaForTraceResult } from "../media/mediaService";

export type OtelMediaKind = MediaPayloadKind;
export type OtelMediaWritePath = "direct" | "legacy";

/** Mutable input, output, and metadata fields owned by one normalized event. */
export type OtelMediaPayload = {
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
};

/**
 * Storage context plus the mutable normalized payload to inspect.
 *
 * `observationId` is absent for trace-level input, output, and metadata.
 * Successful media replacements mutate `payload` in place.
 */
export type OtelMediaTarget = {
  traceId: string;
  observationId?: string;
  payload: OtelMediaPayload;
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
  /** Plausible media values that fail header, base64, or decoding validation. */
  invalid: number;
  /** Unsupported media types and implausible Data URI prefix matches. */
  ignored: number;
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
  writePath: OtelMediaWritePath;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
  result: OtelMediaProcessResult;
};

/**
 * Detects and uploads embedded media for normalized OTEL payloads selected by
 * either the direct or legacy events-table persistence path.
 *
 * Events, fields, and candidates are processed sequentially to bound peak
 * decoded media memory. Successful replacements mutate each event in place.
 * Invalid values and failed uploads are left unchanged; their outcomes are
 * reflected in the returned counters instead of failing the whole run.
 */
export async function processOtelMedia(params: {
  targets: OtelMediaTarget[];
  projectId: string;
  writePath: OtelMediaWritePath;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
}): Promise<OtelMediaProcessResult> {
  const {
    targets,
    projectId,
    writePath,
    mediaBucket,
    mediaPrefix,
    uploadMedia,
  } = params;
  const result: OtelMediaProcessResult = {
    uploaded: 0,
    reused: 0,
    invalid: 0,
    ignored: 0,
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
    for (const field of ["input", "output", "metadata"] as const) {
      const originalValue = target.payload[field];
      if (originalValue == null) continue;

      const context: ProcessContext = {
        projectId,
        traceId: target.traceId,
        observationId: target.observationId,
        field,
        writePath,
        mediaBucket,
        mediaPrefix,
        uploadMedia,
        result,
      };
      const transformed = await transformMediaPayload(originalValue, {
        processCandidate: (candidate) => processCandidate(candidate, context),
        onInvalidCandidate: (kind, reason) =>
          recordInvalidCandidate(kind, reason, context),
        onIgnoredCandidate: (kind, reason) =>
          recordIgnoredCandidate(kind, reason, context),
        onDetectionPath: (path, checkedBytes) =>
          recordDetectionCheck(path, checkedBytes, context),
      });

      // Structured objects are mutated by transformMediaPayload itself and keep
      // their identity. Strings instead return a new value that must be assigned.
      if (transformed.value !== originalValue) {
        target.payload[field] = transformed.value;
      }
      if (transformed.bytesRemoved > 0) {
        result.bytesRemoved += transformed.bytesRemoved;
        recordDistribution(
          "langfuse.ingestion.otel.media.bytes_removed",
          transformed.bytesRemoved,
          { write_path: context.writePath },
        );
      }
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
    contentBytes =
      candidate.encoding === "base64"
        ? Buffer.from(candidate.encodedData, "base64")
        : decodePythonBytesLiteral(candidate.encodedData);
    if (contentBytes.length === 0) {
      recordInvalidCandidate(candidate.kind, "empty_payload", context);
      return;
    }
  } catch {
    recordInvalidCandidate(candidate.kind, "decode_failed", context);
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
      write_path: context.writePath,
    });
    recordDistribution(
      "langfuse.ingestion.otel.media.byte_length",
      contentBytes.length,
      {
        outcome: uploadResult.outcome,
        media_kind: candidate.kind,
        write_path: context.writePath,
      },
    );

    return `@@@langfuseMedia:type=${candidate.contentType}|id=${uploadResult.mediaId}|source=${candidate.source}@@@`;
  } catch (error) {
    context.result.failed += 1;
    recordIncrement("langfuse.ingestion.otel.media", 1, {
      outcome: "failed",
      media_kind: candidate.kind,
      write_path: context.writePath,
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

/**
 * Strictly decodes the subset of Python bytes-literal syntax emitted by
 * `bytes.__repr__`. Returns an exact-size Buffer and rejects malformed escapes
 * instead of interpreting arbitrary Python expressions.
 */
function decodePythonBytesLiteral(value: string): Buffer {
  const decodedLength = scanPythonBytesLiteral(value);
  if (decodedLength === undefined) {
    throw new Error("Invalid Python bytes literal");
  }

  const output = Buffer.alloc(decodedLength);
  const written = scanPythonBytesLiteral(value, output);
  if (written !== decodedLength) {
    throw new Error("Invalid Python bytes literal");
  }
  return output;
}

function scanPythonBytesLiteral(
  value: string,
  output?: Buffer,
): number | undefined {
  const quote = value.charCodeAt(1);
  const end = value.length - 1;
  if (
    value.length < 3 ||
    value.charCodeAt(0) !== 98 ||
    (quote !== 34 && quote !== 39) ||
    value.charCodeAt(end) !== quote
  ) {
    return;
  }

  let offset = 0;
  for (let index = 2; index < end; index += 1) {
    let byte = value.charCodeAt(index);
    if (byte !== 92) {
      if (byte < 32 || byte > 126 || byte === quote) return;
    } else {
      index += 1;
      if (index >= end) return;

      const escape = value.charCodeAt(index);
      if (escape === 120) {
        if (index + 2 >= end) return;
        const high = hexValue(value.charCodeAt(index + 1));
        const low = hexValue(value.charCodeAt(index + 2));
        if (high === undefined || low === undefined) return;
        byte = high * 16 + low;
        index += 2;
      } else {
        const escapedByte = escapedByteValue(escape);
        if (escapedByte === undefined) return;
        byte = escapedByte;
      }
    }

    if (output) output[offset] = byte;
    offset += 1;
  }

  return offset;
}

function escapedByteValue(code: number): number | undefined {
  if (code === 34 || code === 39 || code === 92) return code;
  if (code === 110) return 10;
  if (code === 114) return 13;
  if (code === 116) return 9;
}

function hexValue(code: number): number | undefined {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
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
    write_path: context.writePath,
  });
  recordDistribution(
    "langfuse.ingestion.otel.media.detection_check_byte_length",
    checkedBytes,
    { path, write_path: context.writePath },
  );
}

function recordInvalidCandidate(
  kind: MediaPayloadKind,
  reason: MediaInvalidReason,
  context: ProcessContext,
): void {
  context.result.invalid += 1;
  recordIncrement("langfuse.ingestion.otel.media", 1, {
    outcome: "invalid",
    media_kind: kind,
    reason,
    write_path: context.writePath,
  });
}

function recordIgnoredCandidate(
  kind: MediaPayloadKind,
  reason: MediaIgnoredReason,
  context: ProcessContext,
): void {
  context.result.ignored += 1;
  recordIncrement("langfuse.ingestion.otel.media", 1, {
    outcome: "ignored",
    media_kind: kind,
    reason,
    write_path: context.writePath,
  });
}
