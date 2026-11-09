import type { EarlyOtelBatch, ExtractedOtelMedia } from "@langfuse/native";
import pLimit from "p-limit";
import {
  defineOwnValue,
  isMediaContentType,
  MediaAssociationOrigin,
  type MediaContentType,
  type MediaField,
} from "@langfuse/shared";
import {
  logger,
  mediaDispatchConcurrency,
  otelMediaUploads,
  recordDistribution,
  recordIncrement,
  type OtelMediaTarget,
  type OtelMediaWritePath,
  linkMediaToTraceOrObservation,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

import {
  createMediaReferenceRewriter,
  rewriteMediaValues,
  type MediaRegistry,
} from "./mediaReferenceText";

const MEDIA_PAGE_SIZE = 4_096;

type CachedMediaUpload = {
  mediaId: string;
  outcome: "uploaded" | "reused";
  byteLength: number;
};

// Retain descriptor metadata and completed upload results for the batch's lifetime.
// Decoded bodies and restored source strings stay local to each processing call.
// Upload-only consumers do not need to materialize the descriptor registry in JS;
// media bodies remain native-owned and are read lazily when needed.
const mediaRegistries = new WeakMap<EarlyOtelBatch, Promise<MediaRegistry>>();
const mediaUploadCache = new WeakMap<
  EarlyOtelBatch,
  Map<string, Promise<CachedMediaUpload>>
>();

async function batchMedia(batch: EarlyOtelBatch): Promise<MediaRegistry> {
  const cached = mediaRegistries.get(batch);
  if (cached) return cached;

  const load = (async () => {
    const count = batch.mediaCount();
    const media = new Map<string, ExtractedOtelMedia>();
    for (let offset = 0; offset < count; ) {
      const resultStartedAt = performance.now();
      const page = batch.mediaPage(offset, MEDIA_PAGE_SIZE);
      for (const entry of page) media.set(entry.reference, entry);
      recordDistribution(
        "langfuse.ingestion.otel.main_thread_duration_ms",
        performance.now() - resultStartedAt,
        { phase: "media_descriptors", media_path: "early" },
      );
      const nextOffset = offset + page.length;
      if (nextOffset <= offset)
        throw new Error("native media page returned no progress");
      offset = nextOffset;
      if (offset < count)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return media;
  })();
  mediaRegistries.set(batch, load);
  try {
    return await load;
  } catch (error) {
    if (mediaRegistries.get(batch) === load) mediaRegistries.delete(batch);
    throw error;
  }
}

/**
 * Upload one extracted asset once for an EarlyOtelBatch and retain only its
 * storage result. Legacy and direct writers can call this with their own lazy
 * body reader and destination link; cache hits never retain or decode the body.
 */
export async function uploadExtractedMediaOnce(params: {
  batch: EarlyOtelBatch;
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  mediaBucket: string;
  mediaPrefix: string;
  sha256Hash: string;
  contentType: MediaContentType;
  byteLengthUpperBound: number;
  loadBody: () => Promise<Buffer>;
}): Promise<CachedMediaUpload> {
  const {
    batch,
    projectId,
    traceId,
    observationId,
    field,
    mediaBucket,
    mediaPrefix,
    sha256Hash,
    contentType,
    loadBody,
  } = params;
  const key = [
    projectId,
    mediaBucket,
    mediaPrefix,
    sha256Hash,
    contentType,
  ].join("\u0000");
  const cache =
    mediaUploadCache.get(batch) ??
    new Map<string, Promise<CachedMediaUpload>>();
  mediaUploadCache.set(batch, cache);

  const cached = cache.get(key);
  if (cached) {
    const result = await cached;
    await linkMediaToTraceOrObservation({
      projectId,
      traceId,
      observationId,
      mediaId: result.mediaId,
      field,
      origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
    });
    return { ...result, outcome: "reused" };
  }

  const uploadPromise = otelMediaUploads.run(
    params.byteLengthUpperBound,
    async (): Promise<CachedMediaUpload> => {
      const contentBytes = await loadBody();
      return {
        ...(await uploadMediaForTrace({
          projectId,
          traceId,
          observationId,
          field,
          contentType,
          contentBytes,
          sha256Hash,
          mediaBucket,
          mediaPrefix,
          origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
        })),
        byteLength: contentBytes.length,
      };
    },
  );
  cache.set(key, uploadPromise);
  try {
    return await uploadPromise;
  } catch (error) {
    // Evict a failed attempt so later calls can retry.
    if (cache.get(key) === uploadPromise) cache.delete(key);
    throw error;
  }
}

/** Restore extracted references in fields that do not pass through media resolution. */
export async function restoreInlineMedia(
  batch: EarlyOtelBatch,
  records: Record<string, unknown>[],
  { includePayloads = false }: { includePayloads?: boolean } = {},
): Promise<void> {
  const media = await batchMedia(batch);
  if (media.size === 0) return;
  const rewrite = createMediaReferenceRewriter(batch, media);
  const restore = (value: unknown) => rewriteMediaValues(value, rewrite);
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (
        includePayloads ||
        (key !== "input" && key !== "output" && key !== "metadata")
      ) {
        const previous = record[key];
        const next = await restore(previous);
        if (previous !== next) defineOwnValue(record, key, next);
      }
    }
  }
}

/**
 * Upload native candidates surviving in input/output/metadata. Discovery has
 * already checked media syntax and provider shapes; TS scan-cost limits do not
 * invalidate that work. Only failed uploads are restored here.
 */
export async function resolveExtractedMedia(params: {
  batch: EarlyOtelBatch;
  targets: OtelMediaTarget[];
  projectId: string;
  mediaBucket: string;
  mediaPrefix: string;
  writePath: OtelMediaWritePath;
}) {
  const { batch, targets, projectId, mediaBucket, mediaPrefix, writePath } =
    params;
  const stats = {
    uploaded: 0,
    reused: 0,
    failed: 0,
    candidates: 0,
    bytesProcessed: 0,
    bytesRemoved: 0,
  };
  const media = await batchMedia(batch);
  if (media.size === 0) return stats;
  const rewrite = createMediaReferenceRewriter(batch, media);
  // Share dispatch slots across strings so nested traversals cannot multiply links.
  const dispatch = pLimit(mediaDispatchConcurrency());

  async function resolveReference(
    entry: ExtractedOtelMedia,
    target: OtelMediaTarget,
    field: MediaField,
  ): Promise<string | undefined> {
    try {
      const contentType = entry.contentType;
      if (!isMediaContentType(contentType))
        throw new Error("unsupported extracted media type");
      const result = await uploadExtractedMediaOnce({
        batch,
        projectId,
        mediaBucket,
        mediaPrefix,
        sha256Hash: entry.sha256Hash,
        contentType,
        traceId: target.traceId,
        observationId: target.observationId,
        field,
        // Native retains encoded source spelling, which bounds the decoded body.
        byteLengthUpperBound: entry.originalByteLength,
        loadBody: () => batch.mediaBody(entry.index),
      });
      const replacement = entry.reference.replace(
        /\|id=[^|@]+/,
        `|id=${result.mediaId}`,
      );
      stats.candidates++;
      stats.bytesProcessed += result.byteLength;
      stats[result.outcome]++;
      const bytesRemoved = Math.max(
        0,
        entry.originalByteLength - Buffer.byteLength(replacement),
      );
      stats.bytesRemoved += bytesRemoved;
      recordExtractedMediaUpload(
        result.outcome,
        entry.kind,
        writePath,
        result.byteLength,
        bytesRemoved,
      );
      return replacement;
    } catch (error) {
      stats.failed++;
      recordExtractedMediaUpload("failed", entry.kind, writePath);
      logger.warn(
        "Extracted OTEL media upload failed; keeping the original inline value",
        {
          error,
          projectId,
          traceId: target.traceId,
          observationId: target.observationId,
          field,
        },
      );
      return undefined;
    }
  }

  for (const target of targets) {
    for (const field of ["input", "output", "metadata"] as const) {
      target.payload[field] = await rewriteMediaValues(
        target.payload[field],
        (text) =>
          rewrite(text, (entry) =>
            dispatch(() => resolveReference(entry, target, field)),
          ),
        true,
      );
    }
  }
  return stats;
}

/** Record outcomes for media discovered by the native extractor. */
function recordExtractedMediaUpload(
  outcome: "uploaded" | "reused" | "failed",
  kind: string,
  writePath: OtelMediaWritePath,
  byteLength?: number,
  bytesRemoved = 0,
): void {
  const tags = {
    outcome,
    media_kind: kind,
    write_path: writePath,
    media_path: "early",
  };
  recordIncrement("langfuse.ingestion.otel.media", 1, tags);
  if (byteLength !== undefined)
    recordDistribution(
      "langfuse.ingestion.otel.media.byte_length",
      byteLength,
      tags,
    );
  if (bytesRemoved > 0)
    recordDistribution(
      "langfuse.ingestion.otel.media.bytes_removed",
      bytesRemoved,
      { write_path: writePath, media_path: "early" },
    );
}
