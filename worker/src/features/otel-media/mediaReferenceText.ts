import type {
  EarlyOtelBatch,
  ExtractedOtelMedia,
  MediaRestoreRequest,
} from "@langfuse/native";
import { asRecord, defineOwnValue } from "@langfuse/shared";
import { forEachMedia, recordDistribution } from "@langfuse/shared/src/server";

export type MediaRegistry = ReadonlyMap<string, ExtractedOtelMedia>;

const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const RESTORATION_BATCH_SIZE = 64;
const RESTORATION_BATCH_SOURCE_BYTES = 1024 * 1024;
// `originalMedia` accepts target serializations through sixteen JSON layers.
// This restoration bound is separate from native's two-layer discovery limit.
const MAX_SERIALIZED_REFERENCE_LAYERS = 16;

type KnownMediaReferenceMatch = {
  reference: string;
  entry: ExtractedOtelMedia;
  index: number;
};

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

function parseSerializedJson(value: string): unknown {
  const trimmed = value.trimStart();
  if (
    !trimmed.startsWith("{") &&
    !trimmed.startsWith("[") &&
    !trimmed.startsWith('"')
  )
    return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ||
      asRecord(parsed) ||
      typeof parsed === "string"
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Substitute only this batch's temporary references. Successful uploads need no
 * JSON parsing: everything between reference ranges keeps its exact spelling.
 * On restoration, inspect string layers without reserializing surrounding JSON.
 * Restored text is cached for this call, not retained for the batch's lifetime.
 * A missing resolver, or an undefined result from it, requests restoration.
 */
export function createMediaReferenceRewriter(
  batch: EarlyOtelBatch,
  media: MediaRegistry,
) {
  const originals = new Map<string, Promise<string>>();
  return async (
    value: string,
    resolve?: (entry: ExtractedOtelMedia) => Promise<string | undefined>,
  ): Promise<string> => {
    const matches = knownMediaReferenceMatches(value, media);
    let next = matches.next();
    if (next.done) return value;
    // Uploads share the decoded-byte pool; restoration read sizes must not
    // serialize successful uploads of large originals.
    const uploadResults: Array<string | undefined> = [];
    if (resolve) {
      let index = 0;
      // Scan references twice: this pass starts uploads, and the other replaces
      // them in order. Keeping every match saves little time below roughly 10k
      // references, but holds an extra object for each one.
      await forEachMedia(
        knownMediaReferenceMatches(value, media),
        async ({ entry }) => {
          const position = index++;
          uploadResults[position] = await resolve(entry);
        },
      );
    }
    let resultIndex = 0;
    let layers: Map<number, number> | undefined;
    let output = "";
    let end = 0;
    while (!next.done) {
      const group: KnownMediaReferenceMatch[] = [];
      let sourceBytes = 0;
      while (!next.done && group.length < RESTORATION_BATCH_SIZE) {
        const size = next.value.entry.originalByteLength;
        // Source size estimates the return size; JSON escaping can enlarge it. Large items run alone.
        if (
          group.length > 0 &&
          sourceBytes + size > RESTORATION_BATCH_SOURCE_BYTES
        )
          break;
        group.push(next.value);
        sourceBytes += size;
        next = matches.next();
      }
      const requests = new Map<string, MediaRestoreRequest>();
      const replacements: Array<string | { key: string }> = [];
      for (const match of group) {
        const replacement = uploadResults[resultIndex++];
        if (replacement !== undefined) {
          replacements.push(replacement);
          continue;
        }
        if (layers === undefined)
          layers = serializedReferenceLayers(value, media);
        const depth = layers.get(match.index)!;
        const key = `${match.reference}\u0000${depth}`;
        requests.set(key, { index: match.entry.index, jsonLayers: depth });
        replacements.push({ key });
      }
      // Another string may have cached a read while the uploads above were awaited.
      const missing = [...requests].filter(([key]) => !originals.has(key));
      if (missing.length > 0) {
        const reading = batch.originalMediaBatch(
          missing.map(([, request]) => request),
        );
        missing.forEach(([key], index) => {
          originals.set(
            key,
            reading.then((values) => values[index]!),
          );
        });
      }
      const values = await Promise.all(
        replacements.map((replacement) =>
          typeof replacement === "string"
            ? replacement
            : originals.get(replacement.key)!,
        ),
      );
      const resultStartedAt = performance.now();
      for (const [index, match] of group.entries()) {
        output += value.slice(end, match.index) + values[index]!;
        end = match.index + match.reference.length;
      }
      recordDistribution(
        "langfuse.ingestion.otel.main_thread_duration_ms",
        performance.now() - resultStartedAt,
        { phase: "media_reference_results", media_path: "early" },
      );
    }
    return end === 0 ? value : output + value.slice(end);
  };
}

/**
 * Rewrite actual object values in place. Actual object keys are not visited;
 * opaque string values are rewritten as source text, including JSON keys
 * contained inside those strings.
 * Concurrent rewriting requires an owned JSON tree without shared object nodes.
 */
export async function rewriteMediaValues(
  value: unknown,
  rewrite: (text: string) => Promise<string>,
  concurrent = false,
): Promise<unknown> {
  if (typeof value === "string") return rewrite(value);
  if (typeof value !== "object" || value === null) return value;

  // Iterate rather than recursing: normalization can leave deeply nested objects.
  const stack: Array<{
    object: Record<string, unknown>;
    keys?: string[];
    length: number;
    next: number;
  }> = [];
  const push = (object: object) => {
    const keys = Array.isArray(object) ? undefined : Object.keys(object);
    stack.push({
      object: object as Record<string, unknown>,
      keys,
      length: keys?.length ?? (object as unknown[]).length,
      next: 0,
    });
  };
  push(value);
  function* strings() {
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.next === frame.length) {
        stack.pop();
        continue;
      }
      const index = frame.next++;
      const key = frame.keys ? frame.keys[index]! : index;
      const current = frame.object[key];
      if (typeof current === "string") {
        yield { object: frame.object, key, current };
      } else if (typeof current === "object" && current !== null) {
        push(current);
      }
    }
  }
  const replace = async ({
    object,
    key,
    current,
  }: {
    object: Record<string, unknown>;
    key: string | number;
    current: string;
  }) => {
    const next = await rewrite(current);
    if (current !== next) defineOwnValue(object, key, next);
  };
  if (concurrent) await forEachMedia(strings(), replace);
  else for (const entry of strings()) await replace(entry);
  return value;
}

/**
 * Find the stringified-document depth for each reference in one source string.
 *
 * This is used only on a restoration path. Successful replacement remains
 * a source-text pass and does not parse the surrounding
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

  const root = parseSerializedJson(value);
  if (root === undefined) {
    for (const match of matches) layers.set(match.index, 0);
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

  const stack: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (typeof current.value === "string") {
      if (knownMediaReferenceMatches(current.value, media).next().done)
        continue;
      if (current.depth >= MAX_SERIALIZED_REFERENCE_LAYERS) {
        assign(current.value, current.depth);
        continue;
      }
      // A nested JSON string owns the references represented inside it. Do not
      // assign the same textual markers once at the outer string layer and
      // again after decoding the nested document.
      const nested = parseSerializedJson(current.value);
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
    const record = asRecord(current.value);
    if (record) {
      const entries = Object.entries(record);
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
