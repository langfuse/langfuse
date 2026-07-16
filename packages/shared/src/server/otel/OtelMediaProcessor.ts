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

export type OtelMediaProcessResult = {
  uploaded: number;
  reused: number;
  invalid: number;
  failed: number;
  bytesRemoved: number;
  candidates: number;
  bytesProcessed: number;
  detectionChecks: Record<MediaDetectionPath, number>;
  detectionCheckedBytes: Record<MediaDetectionPath, number>;
};

type UploadCache = Map<
  string,
  Map<string, Promise<UploadMediaForTraceResult | undefined>>
>;

type ProcessContext = {
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
  uploadCache: UploadCache;
  result: OtelMediaProcessResult;
};

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
  const uploadCache: UploadCache = new Map();

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
      uploadCache,
      result,
    };
    const transformed = await transformMediaPayload(originalValue, {
      processCandidate: (candidate) => processCandidate(candidate, context),
      onInvalidCandidate: (kind) => recordInvalidCandidate(kind, context),
      onDetectionPath: (path, checkedBytes) =>
        recordDetectionCheck(path, checkedBytes, context),
    });

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
  let uploadsByContext = context.uploadCache.get(candidate.base64Data);
  if (!uploadsByContext) {
    uploadsByContext = new Map();
    context.uploadCache.set(candidate.base64Data, uploadsByContext);
  }

  const cacheKey = [
    context.traceId,
    context.observationId ?? "",
    context.field,
    candidate.contentType,
  ].join("\0");
  let upload = uploadsByContext.get(cacheKey);
  if (!upload) {
    upload = uploadCandidate(candidate, context);
    uploadsByContext.set(cacheKey, upload);
  }

  const uploadResult = await upload;
  if (!uploadResult) return;

  return `@@@langfuseMedia:type=${candidate.contentType}|id=${uploadResult.mediaId}|source=${candidate.source}@@@`;
}

async function uploadCandidate(
  candidate: MediaPayloadCandidate,
  context: ProcessContext,
): Promise<UploadMediaForTraceResult | undefined> {
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

    return uploadResult;
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
