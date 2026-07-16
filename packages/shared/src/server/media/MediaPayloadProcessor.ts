import { isMediaContentType, type MediaContentType } from "../../domain/media";

const MAX_RECURSION_DEPTH = 10;
const DATA_URI_PREFIX = "data:";
const BASE64_MARKER = ";base64,";
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const MEDIA_REFERENCE_SUFFIX = "@@@";

export type MediaPayloadKind =
  | "data_uri"
  | "anthropic"
  | "vertex"
  | "gemini"
  | "ai_sdk_v6"
  | "ai_sdk_v7";

export type MediaPayloadCandidate = {
  base64Data: string;
  contentType: MediaContentType;
  kind: MediaPayloadKind;
  source: "base64_data_uri" | "bytes";
};

export type MediaDetectionPath =
  | "data_uri"
  | "stringified_json"
  | "structured_payload";

export type TransformMediaPayloadResult = {
  value: unknown;
  bytesRemoved: number;
};

type TransformParams = {
  processCandidate: (
    candidate: MediaPayloadCandidate,
  ) => Promise<string | undefined>;
  onInvalidCandidate: (kind: MediaPayloadKind) => void;
  onDetectionPath: (path: MediaDetectionPath, checkedBytes: number) => void;
};

type DataUriOccurrence = {
  start: number;
  end: number;
  candidate?: MediaPayloadCandidate;
};

type TransformState = {
  changed: boolean;
  bytesRemoved: number;
  checkedBytes: number;
};

type TraversalNode = {
  value: unknown;
  depth: number;
  parent: Record<string, unknown> | unknown[];
  key: string | number;
};

type StructuredMedia = {
  target: Record<string, unknown>;
  property: string;
  content: string;
  contentType: string;
  kind: Exclude<MediaPayloadKind, "data_uri">;
};

const STRUCTURED_MEDIA_SHAPES = [
  {
    type: "base64",
    contentType: "media_type",
    property: "data",
    kind: "anthropic",
  },
  {
    type: "media",
    contentType: "mime_type",
    property: "data",
    kind: "vertex",
  },
  {
    type: "blob",
    contentType: "mime_type",
    property: "content",
    kind: "ai_sdk_v7",
  },
] as const;

export async function transformMediaPayload(
  value: unknown,
  params: TransformParams,
): Promise<TransformMediaPayloadResult> {
  if (typeof value !== "string") {
    if (!isObject(value) && !Array.isArray(value)) {
      return { value, bytesRemoved: 0 };
    }

    const state = await transformStructuredValue(value, params, true);
    return { value, bytesRemoved: state.bytesRemoved };
  }

  if (isMediaReference(value)) return { value, bytesRemoved: 0 };

  if (value.includes(BASE64_MARKER)) {
    const withDataUriReferences = await replaceDataUris(value, params);
    if (
      withDataUriReferences.value !== value ||
      value.includes(DATA_URI_PREFIX)
    ) {
      return withDataUriReferences;
    }
  }

  const strippedValue = value.trimStart();
  if (
    (!strippedValue.startsWith("{") && !strippedValue.startsWith("[")) ||
    !mayContainSerializedMedia(value)
  ) {
    return { value, bytesRemoved: 0 };
  }

  params.onDetectionPath("stringified_json", Buffer.byteLength(value, "utf8"));
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    return { value, bytesRemoved: 0 };
  }

  if (!isObject(parsedValue) && !Array.isArray(parsedValue)) {
    return { value, bytesRemoved: 0 };
  }

  const state = await transformStructuredValue(parsedValue, params, false);
  if (!state.changed) return { value, bytesRemoved: 0 };

  const transformedValue = JSON.stringify(parsedValue);
  return {
    value: transformedValue,
    bytesRemoved: Math.max(
      0,
      Buffer.byteLength(value, "utf8") -
        Buffer.byteLength(transformedValue, "utf8"),
    ),
  };
}

async function replaceDataUris(
  value: string,
  params: TransformParams,
): Promise<{ value: string; bytesRemoved: number }> {
  params.onDetectionPath("data_uri", Buffer.byteLength(value, "utf8"));
  const occurrences = findDataUris(value);
  if (occurrences.length === 0) {
    if (value.startsWith(DATA_URI_PREFIX)) {
      params.onInvalidCandidate("data_uri");
    }
    return { value, bytesRemoved: 0 };
  }

  const replacements = new Map<string, Promise<string | undefined>>();
  let output = "";
  let cursor = 0;
  let bytesRemoved = 0;

  for (const occurrence of occurrences) {
    const original = value.slice(occurrence.start, occurrence.end);
    output += value.slice(cursor, occurrence.start);
    if (!occurrence.candidate) {
      params.onInvalidCandidate("data_uri");
      output += original;
    } else {
      let replacement = replacements.get(original);
      if (!replacement) {
        replacement = params.processCandidate(occurrence.candidate);
        replacements.set(original, replacement);
      }
      const resolvedReplacement = await replacement;
      output += resolvedReplacement ?? original;
      if (resolvedReplacement) {
        bytesRemoved += Math.max(
          0,
          Buffer.byteLength(original, "utf8") -
            Buffer.byteLength(resolvedReplacement, "utf8"),
        );
      }
    }
    cursor = occurrence.end;
  }

  return { value: output + value.slice(cursor), bytesRemoved };
}

function findDataUris(value: string): DataUriOccurrence[] {
  const occurrences: DataUriOccurrence[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let start = value.indexOf(DATA_URI_PREFIX, cursor);
    if (start === -1) break;

    let headerCursor = start + DATA_URI_PREFIX.length;
    while (headerCursor < value.length) {
      if (value.startsWith(DATA_URI_PREFIX, headerCursor)) {
        start = headerCursor;
        headerCursor += DATA_URI_PREFIX.length;
        continue;
      }
      if (value.charCodeAt(headerCursor) === 59) break;
      headerCursor += 1;
    }

    if (headerCursor === value.length) break;
    const semicolon = headerCursor;
    if (!value.startsWith(BASE64_MARKER, semicolon)) {
      cursor = semicolon + 1;
      continue;
    }

    const dataStart = semicolon + BASE64_MARKER.length;
    let end = dataStart;
    let padding = 0;
    let valid = true;
    while (end < value.length && isBase64Character(value.charCodeAt(end))) {
      const code = value.charCodeAt(end);
      if (code === 61) {
        padding += 1;
        if (padding > 2) valid = false;
      } else if (padding > 0) {
        valid = false;
      }
      end += 1;
    }

    const contentType = value.slice(start + DATA_URI_PREFIX.length, semicolon);
    const base64Data = value.slice(dataStart, end);
    occurrences.push({
      start,
      end,
      candidate:
        valid &&
        base64Data.length > 0 &&
        base64Data.length % 4 !== 1 &&
        isMediaContentType(contentType)
          ? {
              base64Data,
              contentType,
              kind: "data_uri",
              source: "base64_data_uri",
            }
          : undefined,
    });
    cursor = Math.max(end, dataStart);
  }

  return occurrences;
}

async function transformStructuredValue(
  value: Record<string, unknown> | unknown[],
  params: TransformParams,
  recordStructuredPath: boolean,
): Promise<TransformState> {
  const state: TransformState = {
    changed: false,
    bytesRemoved: 0,
    checkedBytes: 0,
  };
  const operations: Array<() => Promise<void>> = [];
  const root: Record<string, unknown> = { value };
  const stack: TraversalNode[] = [
    { value, depth: 1, parent: root, key: "value" },
  ];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.depth > MAX_RECURSION_DEPTH) continue;

    if (typeof node.value === "string") {
      state.checkedBytes += Buffer.byteLength(node.value, "utf8");
      if (node.value.includes(BASE64_MARKER)) {
        operations.push(async () => {
          const transformed = await replaceDataUris(
            node.value as string,
            params,
          );
          if (transformed.value !== node.value) {
            setTraversalValue(node, transformed.value);
            state.changed = true;
            state.bytesRemoved += transformed.bytesRemoved;
          }
        });
      }
      continue;
    }

    if (Array.isArray(node.value)) {
      for (let index = node.value.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: node.value[index],
          depth: node.depth + 1,
          parent: node.value,
          key: index,
        });
      }
      continue;
    }
    if (!isObject(node.value)) continue;

    const structuredMedia = matchStructuredMedia(node.value);
    if (structuredMedia) {
      state.checkedBytes += Buffer.byteLength(structuredMedia.content, "utf8");
      operations.push(async () => {
        const bytesRemoved = await replaceStructuredMedia(
          structuredMedia,
          params,
        );
        if (bytesRemoved !== undefined) {
          state.changed = true;
          state.bytesRemoved += bytesRemoved;
        }
      });
      continue;
    }

    const entries = Object.entries(node.value);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, nestedValue] = entries[index]!;
      stack.push({
        value: nestedValue,
        depth: node.depth + 1,
        parent: node.value,
        key,
      });
    }
  }

  if (recordStructuredPath) {
    params.onDetectionPath("structured_payload", state.checkedBytes);
  }
  for (const operation of operations) await operation();
  return state;
}

function setTraversalValue(node: TraversalNode, value: unknown): void {
  defineOwnValue(node.parent, node.key, value);
}

function defineOwnValue(
  target: object,
  property: PropertyKey,
  value: unknown,
): void {
  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function matchStructuredMedia(
  value: Record<string, unknown>,
): StructuredMedia | undefined {
  for (const shape of STRUCTURED_MEDIA_SHAPES) {
    const contentType = value[shape.contentType];
    const content = value[shape.property];
    if (
      value.type === shape.type &&
      typeof contentType === "string" &&
      typeof content === "string"
    ) {
      return {
        target: value,
        property: shape.property,
        content,
        contentType,
        kind: shape.kind,
      };
    }
  }

  if (value.type === "file" && typeof value.mediaType === "string") {
    const property =
      typeof value.data === "string"
        ? "data"
        : typeof value.image === "string"
          ? "image"
          : undefined;
    if (property) {
      return {
        target: value,
        property,
        content: value[property] as string,
        contentType: value.mediaType,
        kind: "ai_sdk_v6",
      };
    }
  }

  for (const inlineDataKey of ["inline_data", "inlineData"] as const) {
    const inlineData = value[inlineDataKey];
    if (!isObject(inlineData) || typeof inlineData.data !== "string") continue;
    const contentType = inlineData.mime_type ?? inlineData.mimeType;
    if (typeof contentType === "string") {
      return {
        target: inlineData,
        property: "data",
        content: inlineData.data,
        contentType,
        kind: "gemini",
      };
    }
  }
}

async function replaceStructuredMedia(
  media: StructuredMedia,
  params: TransformParams,
): Promise<number | undefined> {
  if (isMediaReference(media.content) || isRemoteUrl(media.content)) return;

  const candidate = parseRawBase64(media);
  if (!candidate) {
    params.onInvalidCandidate(media.kind);
    return;
  }

  const replacement = await params.processCandidate(candidate);
  if (replacement) {
    defineOwnValue(media.target, media.property, replacement);
    return Math.max(
      0,
      Buffer.byteLength(media.content, "utf8") -
        Buffer.byteLength(replacement, "utf8"),
    );
  }
}

function parseRawBase64(
  media: StructuredMedia,
): MediaPayloadCandidate | undefined {
  if (!isMediaContentType(media.contentType)) return;

  if (media.content.startsWith(DATA_URI_PREFIX)) {
    const occurrences = findDataUris(media.content);
    const candidate =
      occurrences.length === 1 &&
      occurrences[0]?.start === 0 &&
      occurrences[0]?.end === media.content.length
        ? occurrences[0].candidate
        : undefined;
    return candidate
      ? {
          ...candidate,
          contentType: media.contentType,
          kind: media.kind,
          source: "bytes",
        }
      : undefined;
  }

  return isValidBase64(media.content)
    ? {
        base64Data: media.content,
        contentType: media.contentType,
        kind: media.kind,
        source: "bytes",
      }
    : undefined;
}

function mayContainSerializedMedia(value: string): boolean {
  if (
    value.includes(BASE64_MARKER) ||
    value.includes('"inline_data"') ||
    value.includes('"inlineData"')
  ) {
    return true;
  }

  const hasMediaType =
    value.includes('"media_type"') ||
    value.includes('"mediaType"') ||
    value.includes('"mime_type"') ||
    value.includes('"mimeType"');
  const hasContent =
    value.includes('"data"') ||
    value.includes('"image"') ||
    value.includes('"content"');
  return hasMediaType && hasContent;
}

function isMediaReference(value: string): boolean {
  return (
    value.startsWith(MEDIA_REFERENCE_PREFIX) &&
    value.endsWith(MEDIA_REFERENCE_SUFFIX)
  );
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isValidBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 === 1) return false;

  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 61) {
      padding += 1;
      if (padding > 2) return false;
    } else if (padding > 0 || !isBase64Character(code, false)) {
      return false;
    }
  }
  return true;
}

function isBase64Character(code: number, allowPadding = true): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47 ||
    (allowPadding && code === 61)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
