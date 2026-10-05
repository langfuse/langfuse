import type { EarlyOtelBatch } from "@langfuse/native";
import {
  isMediaContentType,
  MediaAssociationOrigin,
  type MediaContentType,
  type MediaField,
} from "@langfuse/shared";
import {
  logger,
  recordDistribution,
  recordIncrement,
  type OtelMediaTarget,
  type OtelMediaWritePath,
  linkMediaToTraceOrObservation,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";

const MAX_LEGACY_MEDIA_DEPTH = 10;
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const SERIALIZED_PROVIDER_MEDIA_TYPE =
  /"type"\s*:\s*"(?:base64|media|blob|file)"/;

type CachedMediaUpload = {
  mediaId: string;
  outcome: "uploaded" | "reused";
  byteLength: number;
};

// The same EarlyOtelBatch can feed legacy and direct targets. Keep only the successful
// asset result here: decoded bodies remain owned by the individual upload call and are
// released as soon as that call settles. WeakMap lifetime follows the batch handle.
const mediaUploadCache = new WeakMap<
  EarlyOtelBatch,
  Map<string, Promise<CachedMediaUpload>>
>();

/**
 * Upload one extracted asset once for an EarlyOtelBatch and retain only its
 * storage result. Legacy and direct writers can call this with their own lazy
 * body reader and destination link; cache hits never retain or decode the body.
 */
async function uploadExtractedMediaOnce(params: {
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
  const registry = new Map(
    batch.media.map((media) => [media.reference, media]),
  );
  if (registry.size === 0) return;
  const originals = new Map<string, Promise<string>>();
  const restore = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && value.includes("@@@langfuseMedia:")) {
      if (/^\s*[[{]/.test(value)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          /* Plain text also accepts media references. */
        }
        if (parsed !== undefined) return JSON.stringify(await restore(parsed));
      }
      let result = "";
      let end = 0;
      for (const match of value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)) {
        const entry = registry.get(match[0]);
        if (!entry) continue;
        let original = originals.get(entry.reference);
        if (!original) {
          original = batch.originalMedia(entry.index);
          originals.set(entry.reference, original);
        }
        result += value.slice(end, match.index) + (await original);
        end = match.index + match[0].length;
      }
      return end === 0 ? value : result + value.slice(end);
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++)
        value[index] = await restore(value[index]);
    } else if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value)) {
        const object = value as Record<string, unknown>;
        Object.defineProperty(object, key, {
          value: await restore(object[key]),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
    return value;
  };
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (
        includePayloads ||
        (key !== "input" && key !== "output" && key !== "metadata")
      )
        record[key] = await restore(record[key]);
    }
  }
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
  const media = new Map(batch.media.map((entry) => [entry.reference, entry]));
  if (media.size === 0) return stats;
  const originalValues = new Map<string, Promise<string>>();

  function originalFor(entry: (typeof batch.media)[number]): Promise<string> {
    let original = originalValues.get(entry.reference);
    if (!original) {
      original = batch.originalMedia(entry.index);
      originalValues.set(entry.reference, original);
    }
    return original;
  }

  async function uploadExtractedMedia(
    entry: (typeof batch.media)[number],
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

    const structuredTarget = structuredMediaTarget(value);
    for (const key of Object.keys(value)) {
      const current = value[key];
      let next: unknown;
      if (structuredTarget?.property === key && !structuredTarget.container) {
        // The legacy detector only treats a string property as media content.
        next =
          typeof current === "string"
            ? await resolveMediaValue(
                current,
                target,
                field,
                depth + 1,
                "provider",
              )
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
                    depth + 1,
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
    if (rootString && startsWithJson && mayContainSerializedMedia(value)) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed) || isObject(parsed)) {
          const resolved = await resolveMediaValue(
            parsed,
            target,
            field,
            depth + 1,
            mode,
          );
          return JSON.stringify(resolved);
        }
      } catch {
        // Plain text containing references need not itself be JSON.
      }
    }

    // A generic stringified JSON value restores non-data references before it
    // is decoded, so only data-URI references enter the decoded traversal.
    // Plain strings can resolve each extracted reference in one scan.
    if (!startsWithJson || !value.includes(MEDIA_REFERENCE_PREFIX)) {
      return resolveDirectReferences(value, target, field, mode);
    }

    const firstPass =
      mode === "generic" ? await rewriteReferences(value, false, false) : value;
    if (!firstPass.includes(MEDIA_REFERENCE_PREFIX)) return firstPass;

    const firstPassTrimmed = firstPass.trimStart();
    const firstPassIsJson =
      firstPassTrimmed.startsWith("{") || firstPassTrimmed.startsWith("[");
    if (firstPassIsJson) {
      try {
        const parsed: unknown = JSON.parse(firstPass);
        if (Array.isArray(parsed) || isObject(parsed)) {
          const resolved = await resolveMediaValue(
            parsed,
            target,
            field,
            depth + 1,
            "all",
          );
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
    entry: (typeof batch.media)[number],
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

  async function restoreAll(value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      const trimmed = value.trimStart();
      if (
        (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
        value.includes(MEDIA_REFERENCE_PREFIX)
      ) {
        try {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed) || isObject(parsed)) {
            return JSON.stringify(await restoreAll(parsed));
          }
        } catch {
          // Treat malformed embedded JSON as an ordinary string.
        }
      }
      return rewriteReferences(value, false, true);
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++)
        value[index] = await restoreAll(value[index]);
      return value;
    }
    if (isObject(value)) {
      for (const key of Object.keys(value))
        value[key] = await restoreAll(value[key]);
    }
    return value;
  }

  async function rewriteReferences(
    value: string,
    allowProvider: boolean,
    forceRestore: boolean,
  ): Promise<string> {
    if (!value.includes(MEDIA_REFERENCE_PREFIX)) return value;
    const matches = [...value.matchAll(/@@@langfuseMedia:[^@]*@@@/g)];
    let output = "";
    let cursor = 0;
    let changed = false;
    for (const match of matches) {
      const reference = match[0];
      const entry = media.get(reference);
      if (!entry) continue;
      output += value.slice(cursor, match.index);
      if (!forceRestore && (allowProvider || entry.kind === "data_uri")) {
        output += reference;
      } else {
        output += await originalFor(entry);
        changed = true;
      }
      cursor = (match.index ?? 0) + reference.length;
    }
    return changed ? output + value.slice(cursor) : value;
  }
}

function structuredMediaTarget(
  value: Record<string, unknown>,
): { property: string; container?: string } | undefined {
  if (value.type === "base64" && typeof value.media_type === "string")
    return typeof value.data === "string" ? { property: "data" } : undefined;
  if (value.type === "media" && typeof value.mime_type === "string")
    return typeof value.data === "string" ? { property: "data" } : undefined;
  if (value.type === "blob" && typeof value.mime_type === "string")
    return typeof value.content === "string"
      ? { property: "content" }
      : undefined;
  if (value.type === "file" && typeof value.mediaType === "string") {
    if (typeof value.data === "string") return { property: "data" };
    if (typeof value.image === "string") return { property: "image" };
  }
  for (const container of ["inline_data", "inlineData"] as const) {
    const nested = value[container];
    if (!isObject(nested)) continue;
    const contentType = nested.mime_type ?? nested.mimeType;
    if (typeof contentType === "string" && typeof nested.data === "string")
      return { container, property: "data" };
  }
  return undefined;
}

function mayContainSerializedMedia(value: string): boolean {
  const hasData = value.includes('"data"');
  const hasMimeType = value.includes('"mime_type"');
  const hasProviderShapeKeys =
    (hasData && (value.includes('"media_type"') || hasMimeType)) ||
    (value.includes('"content"') && hasMimeType) ||
    ((hasData || value.includes('"image"')) && value.includes('"mediaType"'));
  return (
    (hasProviderShapeKeys && SERIALIZED_PROVIDER_MEDIA_TYPE.test(value)) ||
    (hasData &&
      (value.includes('"inline_data"') || value.includes('"inlineData"')) &&
      (hasMimeType || value.includes('"mimeType"')))
  );
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
  const tags = { outcome, media_kind: kind, write_path: writePath };
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
      { write_path: writePath },
    );
}
