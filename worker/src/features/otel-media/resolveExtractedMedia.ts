import type { EarlyOtelBatch, ExtractedOtelMedia } from "@langfuse/native";
import {
  isMediaContentType,
  MediaAssociationOrigin,
  type MediaContentType,
  type MediaField,
} from "@langfuse/shared";
import {
  logger,
  matchStructuredMedia,
  mayContainSerializedMedia,
  recordDistribution,
  recordIncrement,
  type OtelMediaTarget,
  type OtelMediaWritePath,
  linkMediaToTraceOrObservation,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

const MAX_LEGACY_MEDIA_DEPTH = 10;
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
// Keep this list aligned with OtelIngestionProcessor.extractTags.
const OTEL_TAG_ATTRIBUTE_KEYS = new Set([
  "langfuse.trace.tags",
  "langfuse.tags",
  "langfuse.observation.metadata.langfuse_tags",
  "langfuse.trace.metadata.langfuse_tags",
  "ai.telemetry.metadata.tags",
  "tag.tags",
]);

type CachedMediaUpload = {
  mediaId: string;
  outcome: "uploaded" | "reused";
  byteLength: number;
};

type MediaRegistry = ReadonlyMap<string, ExtractedOtelMedia>;

// Retain descriptor metadata and completed upload results for the batch's lifetime.
// Decoded bodies and restored source strings stay local to each processing call.
// Upload-only consumers do not need to materialize the descriptor registry in JS.
const mediaRegistries = new WeakMap<EarlyOtelBatch, MediaRegistry>();
const mediaUploadCache = new WeakMap<
  EarlyOtelBatch,
  Map<string, Promise<CachedMediaUpload>>
>();

function jsonStringEscapeLayers(value: string, referenceIndex: number): number {
  // Native provider references replace an entire JSON string value. Each outer
  // JSON stringification turns the opening quote's escape run into 0, 1, 3, 7,
  // ... backslashes, so restore the provider value through every layer.
  if (value[referenceIndex - 1] !== '"') return 1;

  let escapedQuoteBackslashes = 0;
  for (
    let index = referenceIndex - 2;
    index >= 0 && value[index] === "\\";
    index--
  ) {
    escapedQuoteBackslashes++;
  }

  let outerLayers = 0;
  while (escapedQuoteBackslashes > 0) {
    if ((escapedQuoteBackslashes - 1) % 2 !== 0) return 1;
    escapedQuoteBackslashes = (escapedQuoteBackslashes - 1) / 2;
    outerLayers++;
  }
  return outerLayers + 1;
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function escapeJsonStringAtReference(
  original: string,
  value: string,
  referenceIndex: number,
): string {
  let escaped = original;
  const layers = jsonStringEscapeLayers(value, referenceIndex);
  for (let layer = 0; layer < layers; layer++) {
    escaped = escapeJsonString(escaped);
  }
  return escaped;
}

function batchMedia(batch: EarlyOtelBatch): MediaRegistry {
  let media = mediaRegistries.get(batch);
  if (!media) {
    media = new Map(batch.media.map((entry) => [entry.reference, entry]));
    mediaRegistries.set(batch, media);
  }
  return media;
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

  const uploadPromise = (async (): Promise<CachedMediaUpload> => {
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
  })();
  cache.set(key, uploadPromise);
  try {
    return await uploadPromise;
  } catch (error) {
    // A failed upload must not poison another occurrence or a later path that
    // can retry the same asset with a fresh decoded body.
    if (cache.get(key) === uploadPromise) cache.delete(key);
    throw error;
  }
}

/** Restore inline values in fields that do not pass through media extraction. */
export async function restoreInlineMedia(
  batch: EarlyOtelBatch,
  records: Record<string, unknown>[],
  { includePayloads = false }: { includePayloads?: boolean } = {},
): Promise<void> {
  const media = batchMedia(batch);
  if (media.size === 0) return;
  const { restore } = createMediaRestorer(batch, media);
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (
        includePayloads ||
        (key !== "input" && key !== "output" && key !== "metadata")
      )
        setObjectValue(record, key, record[key], await restore(record[key]));
    }
  }
}

/**
 * Restore media references in OTLP tag attributes before the shared processor
 * converts scalar values into comma-delimited tag arrays.
 */
export async function restoreOtelTagAttributes(
  batch: EarlyOtelBatch,
  resourceSpans: unknown[],
): Promise<void> {
  const media = batchMedia(batch);
  if (media.size === 0) return;
  const { restore } = createMediaRestorer(batch, media);
  for (const resourceSpan of resourceSpans) {
    if (!isObject(resourceSpan) || !Array.isArray(resourceSpan.scopeSpans))
      continue;
    for (const scopeSpan of resourceSpan.scopeSpans) {
      if (!isObject(scopeSpan) || !Array.isArray(scopeSpan.spans)) continue;
      for (const span of scopeSpan.spans) {
        if (!isObject(span) || !Array.isArray(span.attributes)) continue;
        for (const attribute of span.attributes) {
          if (
            isObject(attribute) &&
            typeof attribute.key === "string" &&
            OTEL_TAG_ATTRIBUTE_KEYS.has(attribute.key)
          )
            setObjectValue(
              attribute,
              "value",
              attribute.value,
              await restore(attribute.value),
            );
        }
      }
    }
  }
}

// Each processing call owns its restoration cache so large source strings are
// released when that call completes, even if another path still owns the batch.
function createMediaRestorer(batch: EarlyOtelBatch, media: MediaRegistry) {
  const originals = new Map<string, Promise<string>>();
  function originalFor(entry: ExtractedOtelMedia): Promise<string> {
    let original = originals.get(entry.reference);
    if (!original) {
      original = batch.originalMedia(entry.index);
      originals.set(entry.reference, original);
    }
    return original;
  }

  function hasKnownMediaReference(value: string): boolean {
    if (!value.includes(MEDIA_REFERENCE_PREFIX)) return false;
    for (const match of value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)) {
      if (media.has(match[0])) return true;
    }
    return false;
  }

  async function restoreReferences(
    value: string,
    jsonString = false,
  ): Promise<string> {
    let output = "";
    let end = 0;
    for (const match of value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)) {
      const entry = media.get(match[0]);
      if (!entry) continue;
      const original = await originalFor(entry);
      let replacement = original;
      if (jsonString) {
        replacement =
          entry.kind === "data_uri"
            ? escapeJsonString(original)
            : escapeJsonStringAtReference(original, value, match.index);
      }
      output += value.slice(end, match.index) + replacement;
      end = match.index + match[0].length;
    }
    return end === 0 ? value : output + value.slice(end);
  }

  async function restore(value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      // Existing public references are opaque. Parsing an unrelated string could
      // change whitespace, escapes or large numeric literals without replacing media.
      if (!hasKnownMediaReference(value)) return value;
      if (/^\s*[[{]/.test(value)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          // Plain text containing references need not itself be JSON.
        }
        if (parsed !== undefined) return JSON.stringify(await restore(parsed));
      }
      return restoreReferences(value);
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++)
        value[index] = await restore(value[index]);
    } else if (isObject(value)) {
      for (const key of Object.keys(value))
        setObjectValue(value, key, value[key], await restore(value[key]));
    }
    return value;
  }

  return {
    originalFor,
    hasKnownMediaReference,
    restore,
    // Preserve surrounding JSON text when all uploads fail; escape only the
    // original media spelling inserted back inside its JSON string quotes.
    restoreStringifiedReferences: (value: string) =>
      restoreReferences(value, true),
  };
}

/** Resolve references that survived normalization, retaining the registry for both write paths. */
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
  const media = batchMedia(batch);
  if (media.size === 0) return stats;
  const {
    originalFor,
    hasKnownMediaReference,
    restore: restoreAll,
    restoreStringifiedReferences,
  } = createMediaRestorer(batch, media);

  async function uploadExtractedMedia(
    entry: ExtractedOtelMedia,
    target: OtelMediaTarget,
    field: MediaField,
  ): Promise<CachedMediaUpload> {
    const contentType = entry.contentType;
    if (!isMediaContentType(contentType))
      throw new Error("unsupported extracted media type");
    return uploadExtractedMediaOnce({
      batch,
      projectId,
      mediaBucket,
      mediaPrefix,
      sha256Hash: entry.sha256Hash,
      contentType,
      traceId: target.traceId,
      observationId: target.observationId,
      field,
      loadBody: () => batch.mediaBody(entry.index),
    });
  }

  for (const target of targets) {
    for (const field of ["input", "output", "metadata"] as const) {
      target.payload[field] = await resolveMediaValue(
        target.payload[field],
        target,
        field,
        1,
        "generic",
        true,
      );
    }
  }
  return stats;

  /**
   * Resolve extracted references in one recursive walk. Generic values upload
   * data-URI entries and restore other entries; recognized provider media
   * fields upload every extracted entry. Non-media provider fields are
   * restored so their original inline values remain available to ingestion.
   */
  type ResolutionMode = "generic" | "provider" | "all" | "restore";

  async function resolveMediaValue(
    value: unknown,
    target: OtelMediaTarget,
    field: MediaField,
    depth: number,
    mode: ResolutionMode,
    rootString = false,
  ): Promise<unknown> {
    if (value == null) return value;
    if (mode === "restore" || depth > MAX_LEGACY_MEDIA_DEPTH) {
      return restoreAll(value);
    }
    if (typeof value === "string") {
      return resolveMediaString(value, target, field, depth, mode, rootString);
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        value[index] = await resolveMediaValue(
          value[index],
          target,
          field,
          depth + 1,
          mode,
        );
      }
      return value;
    }
    if (!isObject(value)) return value;

    if (mode === "all") {
      for (const key of Object.keys(value)) {
        const current = value[key];
        const next = await resolveMediaValue(
          current,
          target,
          field,
          depth + 1,
          "all",
        );
        setObjectValue(value, key, current, next);
      }
      return value;
    }

    const structuredTarget = matchStructuredMedia(value);
    for (const key of Object.keys(value)) {
      const current = value[key];
      let next: unknown;
      if (structuredTarget?.property === key && !structuredTarget.container) {
        // The legacy detector only treats a string property as media content.
        next =
          typeof current === "string"
            ? await resolveMediaValue(current, target, field, depth, "provider")
            : await restoreAll(current);
      } else if (structuredTarget?.container === key) {
        if (isObject(current)) {
          for (const nestedKey of Object.keys(current)) {
            const nestedCurrent = current[nestedKey];
            const nestedNext =
              structuredTarget.property === nestedKey &&
              typeof nestedCurrent === "string"
                ? await resolveMediaValue(
                    nestedCurrent,
                    target,
                    field,
                    depth,
                    "provider",
                  )
                : await restoreAll(nestedCurrent);
            setObjectValue(current, nestedKey, nestedCurrent, nestedNext);
          }
          continue;
        }
        next = await restoreAll(current);
      } else {
        // A recognized provider object is a leaf for the legacy detector. Its
        // non-media fields must not retain references discovered by the broad
        // early scanner.
        next = await resolveMediaValue(
          current,
          target,
          field,
          depth + 1,
          structuredTarget ? "restore" : mode,
        );
      }
      setObjectValue(value, key, current, next);
    }
    return value;
  }

  async function resolveMediaString(
    value: string,
    target: OtelMediaTarget,
    field: MediaField,
    depth: number,
    mode: Exclude<ResolutionMode, "restore">,
    rootString: boolean,
  ): Promise<string> {
    const trimmed = value.trimStart();
    const startsWithJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    // Root provider-shaped strings are decoded here so their media fields can
    // be resolved in the same traversal as object values.
    if (
      rootString &&
      startsWithJson &&
      mayContainSerializedMedia(value) &&
      hasKnownMediaReference(value)
    ) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed) || isObject(parsed)) {
          const successfulBefore = stats.uploaded + stats.reused;
          const resolved = await resolveMediaValue(
            parsed,
            target,
            field,
            depth,
            mode,
          );
          if (stats.uploaded + stats.reused === successfulBefore)
            return restoreStringifiedReferences(value);
          return JSON.stringify(resolved);
        }
      } catch {
        // Plain text containing references need not itself be JSON.
      }
    }

    // A generic stringified JSON value restores non-data references before it
    // is decoded, so only data-URI references enter the decoded traversal.
    // Plain strings can resolve each extracted reference in one scan.
    if (!startsWithJson || !hasKnownMediaReference(value)) {
      return resolveDirectReferences(value, target, field, mode);
    }

    const firstPass =
      mode === "generic" ? await restoreProviderReferences(value) : value;
    if (!hasKnownMediaReference(firstPass)) return firstPass;

    const firstPassTrimmed = firstPass.trimStart();
    const firstPassIsJson =
      firstPassTrimmed.startsWith("{") || firstPassTrimmed.startsWith("[");
    if (firstPassIsJson) {
      try {
        const parsed: unknown = JSON.parse(firstPass);
        if (Array.isArray(parsed) || isObject(parsed)) {
          const successfulBefore = stats.uploaded + stats.reused;
          const resolved = await resolveMediaValue(
            parsed,
            target,
            field,
            depth,
            "all",
          );
          if (stats.uploaded + stats.reused === successfulBefore)
            return restoreStringifiedReferences(value);
          return JSON.stringify(resolved);
        }
      } catch {
        // Text containing references need not itself be JSON.
      }
    }

    return resolveDirectReferences(
      firstPass,
      target,
      field,
      mode === "generic" ? "all" : mode,
    );
  }

  async function resolveDirectReferences(
    value: string,
    target: OtelMediaTarget,
    field: MediaField,
    mode: Exclude<ResolutionMode, "restore">,
  ): Promise<string> {
    let output = "";
    let end = 0;
    let changed = false;
    for (const match of value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)) {
      const entry = media.get(match[0]);
      if (!entry) continue;
      output += value.slice(end, match.index);
      const replacement = await resolveReference(entry, target, field, mode);
      output += replacement;
      changed = changed || replacement !== entry.reference;
      end = match.index + match[0].length;
    }
    return changed ? output + value.slice(end) : value;
  }

  async function resolveReference(
    entry: ExtractedOtelMedia,
    target: OtelMediaTarget,
    field: MediaField,
    mode: Exclude<ResolutionMode, "restore">,
  ): Promise<string> {
    if (mode === "generic" && entry.kind !== "data_uri") {
      return originalFor(entry);
    }
    try {
      if (!isMediaContentType(entry.contentType))
        throw new Error("unsupported extracted media type");
      const result = await uploadExtractedMedia(entry, target, field);
      stats.candidates++;
      stats.bytesProcessed += result.byteLength;
      const replacement = entry.reference.replace(
        /\|id=[^|@]+/,
        `|id=${result.mediaId}`,
      );
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
      return originalFor(entry);
    }
  }

  async function restoreProviderReferences(value: string): Promise<string> {
    let output = "";
    let cursor = 0;
    for (const match of value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)) {
      const entry = media.get(match[0]);
      if (!entry || entry.kind === "data_uri") continue;
      const original = await originalFor(entry);
      output +=
        value.slice(cursor, match.index) +
        escapeJsonStringAtReference(original, value, match.index);
      cursor = match.index + match[0].length;
    }
    return cursor === 0 ? value : output + value.slice(cursor);
  }
}

function setObjectValue(
  object: Record<string, unknown>,
  key: string,
  previous: unknown,
  next: unknown,
): void {
  if (previous === next) return;
  // Define the property instead of assigning through the prototype setter;
  // media references can occur under a user-controlled `__proto__` key.
  Object.defineProperty(object, key, {
    value: next,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Preserve media outcome metrics when detection/decoding is performed by Rust. */
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
