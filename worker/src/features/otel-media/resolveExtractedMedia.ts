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
const MAX_SERIALIZED_REFERENCE_LAYERS = 2;
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const MEDIA_PAGE_SIZE = 4_096;
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

type KnownMediaReferenceMatch = {
  reference: string;
  entry: ExtractedOtelMedia;
  index: number;
};

type ResolutionContext = {
  source: string;
  matches: KnownMediaReferenceMatch[];
  decisions: Array<string | null | undefined>;
  occurrenceQueues: Map<string, number[]>;
  occurrenceCursors: Map<string, number>;
  jsonString: boolean;
  jsonLayers?: Map<number, number>;
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
      const page = batch.mediaPage(offset, MEDIA_PAGE_SIZE);
      for (const entry of page) media.set(entry.reference, entry);
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

/** Find only references owned by this batch; malformed markers cannot consume a later one. */
function* knownMediaReferenceMatches(
  value: string,
  media: MediaRegistry,
): Generator<KnownMediaReferenceMatch> {
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const index = value.indexOf(MEDIA_REFERENCE_PREFIX, searchFrom);
    if (index === -1) return;
    const end = value.indexOf("@@@", index + MEDIA_REFERENCE_PREFIX.length);
    if (end === -1) return;
    const reference = value.slice(index, end + 3);
    const entry = media.get(reference);
    if (entry) {
      yield { reference, entry, index };
      searchFrom = end + 3;
    } else {
      // An unterminated marker can see the opening delimiter of a later known
      // marker as its closing delimiter. Search inside it before giving up.
      searchFrom = index + MEDIA_REFERENCE_PREFIX.length;
    }
  }
}

function containsOnlyDataUriReferences(
  value: unknown,
  media: MediaRegistry,
): boolean {
  if (typeof value !== "string") return false;
  let found = false;
  for (const match of knownMediaReferenceMatches(value, media)) {
    found = true;
    if (match.entry.kind !== "data_uri") return false;
  }
  return found;
}

function containsDataUriReference(
  value: unknown,
  media: MediaRegistry,
): boolean {
  if (typeof value !== "string") return false;
  for (const match of knownMediaReferenceMatches(value, media)) {
    if (match.entry.kind === "data_uri") return true;
  }
  return false;
}

function isSerializedJsonContainer(value: string): boolean {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) || isObject(parsed);
  } catch {
    return false;
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

/** Restore extracted references in fields that do not pass through media resolution. */
export async function restoreInlineMedia(
  batch: EarlyOtelBatch,
  records: Record<string, unknown>[],
  { includePayloads = false }: { includePayloads?: boolean } = {},
): Promise<void> {
  const media = await batchMedia(batch);
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
  const media = await batchMedia(batch);
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

/**
 * Find the stringified-document depth for each reference in one source string.
 *
 * This is deliberately used only on a restoration path. Successful data-URI
 * replacement remains a source-text pass and does not parse the surrounding
 * document. Parsing here is for depth inspection only; the original source is
 * still rebuilt by replacing the known reference ranges in the current text.
 */
function serializedReferenceLayers(
  value: string,
  media: MediaRegistry,
): Map<number, number> {
  const matches = [...knownMediaReferenceMatches(value, media)];
  const layers = new Map<number, number>();
  if (matches.length === 0) return layers;

  // The native scanner only interprets two embedded JSON documents. At the
  // ordinary one-layer boundary every reference in this current string has
  // the same source depth; avoid building an AST just to rediscover that fact.
  if (matches.every(({ entry }) => entry.originalJsonDepth <= 1)) {
    for (const match of matches) layers.set(match.index, 1);
    return layers;
  }

  const pendingByReference = new Map<string, number[]>();
  const pendingCursor = new Map<string, number>();
  for (const [matchIndex, match] of matches.entries()) {
    const pending = pendingByReference.get(match.reference) ?? [];
    pending.push(matchIndex);
    pendingByReference.set(match.reference, pending);
  }

  const assign = (text: string, depth: number): void => {
    for (const match of knownMediaReferenceMatches(text, media)) {
      const pending = pendingByReference.get(match.reference);
      const cursor = pendingCursor.get(match.reference) ?? 0;
      const matchIndex = pending?.[cursor];
      if (matchIndex === undefined) continue;
      pendingCursor.set(match.reference, cursor + 1);
      layers.set(matches[matchIndex]!.index, depth);
    }
  };

  const parseContainer = (text: string): unknown => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) || isObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  const root = parseContainer(value);
  if (root === undefined) {
    assign(value, 1);
    return layers;
  }

  const stack: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (typeof current.value === "string") {
      if (!hasKnownMediaReferenceInRegistry(current.value, media)) continue;
      if (current.depth >= MAX_SERIALIZED_REFERENCE_LAYERS) {
        assign(current.value, current.depth);
        continue;
      }
      // A nested JSON string owns the references represented inside it. Do not
      // assign the same textual markers once at the outer string layer and
      // again after decoding the nested document.
      const nested = parseContainer(current.value);
      if (nested !== undefined) {
        stack.push({ value: nested, depth: current.depth + 1 });
      } else {
        assign(current.value, current.depth);
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index--)
        stack.push({ value: current.value[index], depth: current.depth });
      continue;
    }
    if (isObject(current.value)) {
      const entries = Object.entries(current.value);
      for (let index = entries.length - 1; index >= 0; index--)
        stack.push({ value: entries[index]![1], depth: current.depth });
    }
  }

  // Duplicate JSON keys can be discarded by JSON.parse. Preserve the depth
  // recorded by native for a source occurrence that the inspection walk cannot
  // associate with a surviving parsed value.
  for (const match of matches) {
    if (!layers.has(match.index)) {
      layers.set(match.index, Math.max(1, match.entry.originalJsonDepth));
    }
  }
  return layers;
}

function hasKnownMediaReferenceInRegistry(
  value: string,
  media: MediaRegistry,
): boolean {
  return knownMediaReferenceMatches(value, media).next().done === false;
}

// Restoration text stays scoped to one processing call; the batch and its
// upload cache may still be shared by another write path.
function createMediaRestorer(
  batch: EarlyOtelBatch,
  media: MediaRegistry,
  recordReference?: (reference: string) => void,
) {
  const originals = new Map<string, Promise<string>>();
  function originalFor(
    entry: ExtractedOtelMedia,
    jsonLayers = 0,
  ): Promise<string> {
    const cacheKey = `${entry.reference}\u0000${jsonLayers}`;
    let original = originals.get(cacheKey);
    if (!original) {
      original = batch.originalMedia(entry.index, jsonLayers);
      originals.set(cacheKey, original);
    }
    return original;
  }

  function hasKnownMediaReference(value: string): boolean {
    return knownMediaReferenceMatches(value, media).next().done === false;
  }

  async function restoreReference(
    entry: ExtractedOtelMedia,
    jsonLayers?: number,
    record = true,
  ): Promise<string> {
    if (record) recordReference?.(entry.reference);
    return originalFor(entry, jsonLayers ?? 0);
  }

  async function restoreReferences(
    value: string,
    jsonString = false,
  ): Promise<string> {
    const layers = jsonString
      ? serializedReferenceLayers(value, media)
      : undefined;
    let output = "";
    let end = 0;
    for (const match of knownMediaReferenceMatches(value, media)) {
      const replacement = await restoreReference(
        match.entry,
        layers?.get(match.index) ?? 0,
      );
      output += value.slice(end, match.index) + replacement;
      end = match.index + match.reference.length;
    }
    return end === 0 ? value : output + value.slice(end);
  }

  async function restore(value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      if (!hasKnownMediaReference(value)) return value;
      return restoreReferences(value, isSerializedJsonContainer(value));
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
    restoreReference,
  };
}

/** Resolve native references that survived normalization for legacy and direct writes. */
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
  const resolutionContexts: ResolutionContext[] = [];
  const nextContextMatch = (
    context: ResolutionContext,
    reference: string,
    consume: boolean,
  ): number | undefined => {
    const occurrences = context.occurrenceQueues.get(reference);
    const cursor = context.occurrenceCursors.get(reference) ?? 0;
    const matchIndex = occurrences?.[cursor];
    if (matchIndex !== undefined && consume)
      context.occurrenceCursors.set(reference, cursor + 1);
    return matchIndex;
  };
  const skipReference = (reference: string): void => {
    for (const context of resolutionContexts)
      nextContextMatch(context, reference, true);
  };
  const recordReference = (reference: string, replacement?: string): void => {
    for (const context of resolutionContexts) {
      const matchIndex = nextContextMatch(context, reference, true);
      if (matchIndex !== undefined) context.decisions[matchIndex] = replacement;
    }
  };
  const {
    originalFor,
    hasKnownMediaReference,
    restoreReference,
    restore: restoreAll,
  } = createMediaRestorer(batch, media, (reference) =>
    recordReference(reference),
  );

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
   * Apply legacy provider eligibility to native references. Generic data URIs
   * are uploaded; other references are restored inline unless the legacy
   * provider rules accept them.
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
    if (
      mode === "restore" ||
      (depth > MAX_LEGACY_MEDIA_DEPTH &&
        !containsDataUriReference(value, media))
    ) {
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
        for (const match of knownMediaReferenceMatches(key, media))
          skipReference(match.reference);
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
      for (const match of knownMediaReferenceMatches(key, media))
        skipReference(match.reference);
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
            for (const match of knownMediaReferenceMatches(nestedKey, media))
              skipReference(match.reference);
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
        // Provider objects are leaves for the legacy detector; restore
        // references in fields it does not upload.
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
    // A data URI reference is already a complete extraction decision. Replace
    // it in the source text before considering provider-shaped JSON. This keeps
    // deeply nested text bounded and avoids parsing a data-only document.
    if (containsDataUriReference(value, media)) {
      const dataOnly = containsOnlyDataUriReferences(value, media);
      const dataResolved = await resolveDirectReferences(
        value,
        target,
        field,
        mode,
        true,
      );
      if (dataOnly || depth > MAX_LEGACY_MEDIA_DEPTH)
        return restoreProviderReferences(dataResolved);
      value = dataResolved;
    }
    const trimmed = value.trimStart();
    const startsWithJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    // Decode a root provider-shaped string so its media fields follow the same
    // rules as object values.
    if (
      rootString &&
      startsWithJson &&
      mayContainSerializedMedia(value) &&
      hasKnownMediaReference(value)
    ) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed) || isObject(parsed)) {
          const context = resolutionContext(value, true);
          resolutionContexts.push(context);
          try {
            await resolveMediaValue(parsed, target, field, depth, mode);
            return replaceResolvedReferences(value, true, context);
          } finally {
            resolutionContexts.pop();
          }
        }
      } catch {
        // A reference-containing string may still be plain text.
      }
    }

    // Restore provider references before decoding generic JSON so only data-URI
    // references enter the broad traversal.
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
          const context = resolutionContext(firstPass, true);
          resolutionContexts.push(context);
          try {
            await resolveMediaValue(parsed, target, field, depth, "all");
            return replaceResolvedReferences(firstPass, true, context);
          } finally {
            resolutionContexts.pop();
          }
        }
      } catch {
        // A reference-containing string may still be plain text.
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
    dataUriOnly = false,
  ): Promise<string> {
    let serializedLayers: Map<number, number> | undefined;
    let serialized: boolean | undefined;
    const layerFor = (match: KnownMediaReferenceMatch): number => {
      const active = activeJsonLayers(match.entry);
      if (active > 0) return active;
      if (serialized === undefined)
        serialized = isSerializedJsonContainer(value);
      if (!serialized) return 0;
      if (serializedLayers === undefined)
        serializedLayers = serializedReferenceLayers(value, media);
      return serializedLayers.get(match.index) ?? 1;
    };
    let output = "";
    let end = 0;
    let changed = false;
    for (const match of knownMediaReferenceMatches(value, media)) {
      output += value.slice(end, match.index);
      if (dataUriOnly && match.entry.kind !== "data_uri") {
        output += match.reference;
        end = match.index + match.reference.length;
        continue;
      }
      const replacement = await resolveReference(
        match.entry,
        target,
        field,
        mode,
        () => layerFor(match),
      );
      output += replacement;
      changed = changed || replacement !== match.reference;
      end = match.index + match.reference.length;
    }
    return changed ? output + value.slice(end) : value;
  }

  function activeJsonLayers(entry: ExtractedOtelMedia): number {
    const context = resolutionContexts.at(-1);
    if (!context?.jsonString) return 0;
    const matchIndex = nextContextMatch(context, entry.reference, false);
    if (matchIndex === undefined) return 0;
    const match = context.matches[matchIndex];
    if (!match) return 0;
    if (context.jsonLayers === undefined)
      context.jsonLayers = serializedReferenceLayers(context.source, media);
    return context.jsonLayers.get(match.index) ?? 1;
  }

  async function resolveReference(
    entry: ExtractedOtelMedia,
    target: OtelMediaTarget,
    field: MediaField,
    mode: Exclude<ResolutionMode, "restore">,
    jsonLayers?: number | (() => number),
  ): Promise<string> {
    const getJsonLayers = (): number => {
      if (jsonLayers === undefined) return activeJsonLayers(entry);
      if (typeof jsonLayers === "function") return jsonLayers();
      return jsonLayers;
    };
    if (mode === "generic" && entry.kind !== "data_uri") {
      const original = await originalFor(entry, getJsonLayers());
      recordReference(entry.reference);
      return original;
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
      recordReference(entry.reference, replacement);
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
      const original = await originalFor(entry, getJsonLayers());
      recordReference(entry.reference);
      return original;
    }
  }

  async function restoreProviderReferences(value: string): Promise<string> {
    const matches = [...knownMediaReferenceMatches(value, media)];
    const providerMatches = matches.filter(
      (match) => match.entry.kind !== "data_uri",
    );
    if (providerMatches.length === 0) return value;
    const jsonString = isSerializedJsonContainer(value);
    const layers = jsonString
      ? serializedReferenceLayers(value, media)
      : undefined;
    let output = "";
    let cursor = 0;
    for (const match of providerMatches) {
      output +=
        value.slice(cursor, match.index) +
        (await restoreReference(match.entry, layers?.get(match.index) ?? 0));
      cursor = match.index + match.reference.length;
    }
    return cursor === 0 ? value : output + value.slice(cursor);
  }

  async function replaceResolvedReferences(
    value: string,
    jsonString: boolean,
    context: ResolutionContext,
  ): Promise<string> {
    let layers: Map<number, number> | undefined;
    const layerFor = (match: KnownMediaReferenceMatch): number => {
      if (!jsonString) return 0;
      if (layers === undefined) {
        layers = context.jsonLayers ?? serializedReferenceLayers(value, media);
        context.jsonLayers = layers;
      }
      return layers.get(match.index) ?? 1;
    };
    let output = "";
    let end = 0;
    let changed = false;
    for (let index = 0; index < context.matches.length; index++) {
      const match = context.matches[index]!;
      const decision = context.decisions[index];
      let replacement: string;
      if (decision === null) replacement = match.reference;
      else if (decision === undefined)
        replacement = await restoreReference(
          match.entry,
          layerFor(match),
          false,
        );
      else replacement = decision;
      output += value.slice(end, match.index) + replacement;
      changed = changed || replacement !== match.reference;
      end = match.index + match.reference.length;
    }
    return changed ? output + value.slice(end) : value;
  }

  function resolutionContext(
    value: string,
    jsonString = false,
  ): ResolutionContext {
    const matches = [...knownMediaReferenceMatches(value, media)];
    const occurrenceQueues = new Map<string, number[]>();
    for (const [matchIndex, match] of matches.entries()) {
      const occurrences = occurrenceQueues.get(match.reference) ?? [];
      occurrences.push(matchIndex);
      occurrenceQueues.set(match.reference, occurrences);
    }
    return {
      source: value,
      matches,
      decisions: new Array(matches.length).fill(null),
      occurrenceQueues,
      occurrenceCursors: new Map(),
      jsonString,
    };
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
