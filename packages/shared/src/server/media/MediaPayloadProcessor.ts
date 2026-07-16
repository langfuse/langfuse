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

type TransformParams = {
  processCandidate: (
    candidate: MediaPayloadCandidate,
  ) => Promise<string | undefined>;
  onInvalidCandidate: (kind: MediaPayloadKind) => void;
};

type DataUriOccurrence = {
  start: number;
  end: number;
  raw: string;
  candidate?: MediaPayloadCandidate;
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
  value: string,
  params: TransformParams,
): Promise<string> {
  if (isMediaReference(value)) return value;

  if (value.includes(BASE64_MARKER)) {
    const withDataUriReferences = await replaceDataUris(value, params);
    if (withDataUriReferences !== value || value.includes(DATA_URI_PREFIX)) {
      return withDataUriReferences;
    }
  }

  const strippedValue = value.trimStart();
  if (
    (!strippedValue.startsWith("{") && !strippedValue.startsWith("[")) ||
    !mayContainSerializedMedia(value)
  ) {
    return value;
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    return value;
  }

  if (!isObject(parsedValue) && !Array.isArray(parsedValue)) return value;

  const state = { changed: false };
  await transformJsonValue(parsedValue, params, state, 1);
  return state.changed ? JSON.stringify(parsedValue) : value;
}

async function replaceDataUris(
  value: string,
  params: TransformParams,
): Promise<string> {
  const occurrences = findDataUris(value);
  if (occurrences.length === 0) {
    if (value.startsWith(DATA_URI_PREFIX)) {
      params.onInvalidCandidate("data_uri");
    }
    return value;
  }

  const replacements = new Map<string, Promise<string | undefined>>();
  let output = "";
  let cursor = 0;

  for (const occurrence of occurrences) {
    output += value.slice(cursor, occurrence.start);
    if (!occurrence.candidate) {
      params.onInvalidCandidate("data_uri");
      output += occurrence.raw;
    } else {
      let replacement = replacements.get(occurrence.raw);
      if (!replacement) {
        replacement = params.processCandidate(occurrence.candidate);
        replacements.set(occurrence.raw, replacement);
      }
      output += (await replacement) ?? occurrence.raw;
    }
    cursor = occurrence.end;
  }

  return output + value.slice(cursor);
}

function findDataUris(value: string): DataUriOccurrence[] {
  const occurrences: DataUriOccurrence[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf(DATA_URI_PREFIX, cursor);
    if (start === -1) break;

    const semicolon = value.indexOf(";", start + DATA_URI_PREFIX.length);
    const nestedStart = value.indexOf(
      DATA_URI_PREFIX,
      start + DATA_URI_PREFIX.length,
    );
    if (nestedStart !== -1 && (semicolon === -1 || nestedStart < semicolon)) {
      cursor = nestedStart;
      continue;
    }
    if (semicolon === -1) break;
    if (!value.startsWith(BASE64_MARKER, semicolon)) {
      cursor = semicolon + 1;
      continue;
    }

    const dataStart = semicolon + BASE64_MARKER.length;
    let end = dataStart;
    while (end < value.length && isBase64Character(value.charCodeAt(end))) {
      end += 1;
    }

    const raw = value.slice(start, end);
    const contentType = value.slice(start + DATA_URI_PREFIX.length, semicolon);
    const base64Data = value.slice(dataStart, end);
    occurrences.push({
      start,
      end,
      raw,
      candidate:
        isMediaContentType(contentType) && isValidBase64(base64Data)
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

async function transformJsonValue(
  value: unknown,
  params: TransformParams,
  state: { changed: boolean },
  depth: number,
): Promise<unknown> {
  if (depth > MAX_RECURSION_DEPTH) return value;

  if (typeof value === "string") {
    if (!value.includes(BASE64_MARKER)) return value;
    const transformed = await replaceDataUris(value, params);
    if (transformed !== value) state.changed = true;
    return transformed;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = await transformJsonValue(
        value[index],
        params,
        state,
        depth + 1,
      );
    }
    return value;
  }
  if (!isObject(value)) return value;

  const structuredMedia = matchStructuredMedia(value);
  if (structuredMedia) {
    await replaceStructuredMedia(structuredMedia, params, state);
    return value;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    value[key] = await transformJsonValue(
      nestedValue,
      params,
      state,
      depth + 1,
    );
  }
  return value;
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
  state: { changed: boolean },
): Promise<void> {
  if (isMediaReference(media.content) || isRemoteUrl(media.content)) return;

  const candidate = parseRawBase64(media);
  if (!candidate) {
    params.onInvalidCandidate(media.kind);
    return;
  }

  const replacement = await params.processCandidate(candidate);
  if (replacement) {
    media.target[media.property] = replacement;
    state.changed = true;
  }
}

function parseRawBase64(
  media: StructuredMedia,
): MediaPayloadCandidate | undefined {
  if (!isMediaContentType(media.contentType)) return;

  if (media.content.startsWith(DATA_URI_PREFIX)) {
    const occurrences = findDataUris(media.content);
    const candidate =
      occurrences.length === 1 && occurrences[0]?.raw === media.content
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
