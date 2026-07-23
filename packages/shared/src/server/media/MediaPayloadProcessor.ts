import { isMediaContentType, type MediaContentType } from "../../domain/media";

const MAX_RECURSION_DEPTH = 10;
const DATA_URI_PREFIX = "data:";
const BASE64_MARKER = ";base64,";
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const MEDIA_REFERENCE_SUFFIX = "@@@";
const SERIALIZED_PROVIDER_MEDIA_TYPE =
  /"type"\s*:\s*"(?:base64|media|blob|file)"/;

export type MediaPayloadKind =
  | "data_uri"
  | "anthropic"
  | "vertex"
  | "gemini"
  | "ai_sdk_v6"
  | "ai_sdk_v7";

export type MediaInvalidReason =
  | "empty_payload"
  | "invalid_base64"
  | "invalid_base64_length"
  | "invalid_base64_padding"
  | "malformed_data_uri_header"
  | "decode_failed";

export type MediaIgnoredReason =
  | "implausible_data_uri_prefix"
  | "unsupported_content_type";

export type MediaPayloadCandidate = {
  encodedData: string;
  encoding: "base64" | "python_bytes_literal";
  contentType: MediaContentType;
  kind: MediaPayloadKind;
  source: "base64_data_uri" | "bytes";
};

export type MediaDetectionPath =
  | "data_uri"
  | "stringified_json"
  | "structured_payload";

export type TransformMediaPayloadResult = {
  /** Transformed string, or the original structured value mutated in place. */
  value: unknown;
  /** UTF-8 bytes removed by successful media-reference replacements. */
  bytesRemoved: number;
};

type TransformParams = {
  processCandidate: (
    candidate: MediaPayloadCandidate,
  ) => Promise<string | undefined>;
  onInvalidCandidate: (
    kind: MediaPayloadKind,
    reason: MediaInvalidReason,
  ) => void;
  onIgnoredCandidate: (
    kind: MediaPayloadKind,
    reason: MediaIgnoredReason,
  ) => void;
  onDetectionPath: (path: MediaDetectionPath, checkedBytes: number) => void;
};

type DataUriOccurrence =
  | {
      start: number;
      end: number;
      status: "valid";
      candidate: MediaPayloadCandidate;
    }
  | {
      start: number;
      end: number;
      status: "invalid";
      reason: MediaInvalidReason;
    }
  | {
      start: number;
      end: number;
      status: "ignored";
      reason: MediaIgnoredReason;
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

/**
 * Finds embedded media in a normalized input, output, or metadata value and
 * delegates each valid candidate to `processCandidate`.
 *
 * String inputs are immutable and return a replacement string when changed.
 * Object and array inputs are traversed and mutated in place only after a
 * candidate is processed successfully. Unsupported values, invalid media, and
 * candidates for which `processCandidate` returns `undefined` stay unchanged.
 */
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

  let valueToParse = value;
  let dataUriResult: Awaited<ReturnType<typeof replaceDataUris>> | undefined;
  // `;base64,` is a substantially narrower and cheaper precondition than
  // `data:`. Most ordinary strings therefore avoid the full Data URI scan.
  if (value.includes(BASE64_MARKER)) {
    dataUriResult = await replaceDataUris(value, params);
    valueToParse = dataUriResult.value;
  }

  const strippedValue = valueToParse.trimStart();
  if (
    (!strippedValue.startsWith("{") && !strippedValue.startsWith("[")) ||
    !mayContainSerializedMedia(valueToParse)
  ) {
    return dataUriResult ?? { value, bytesRemoved: 0 };
  }

  params.onDetectionPath(
    "stringified_json",
    Buffer.byteLength(valueToParse, "utf8"),
  );
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(valueToParse);
  } catch {
    return dataUriResult ?? { value, bytesRemoved: 0 };
  }

  if (!isObject(parsedValue) && !Array.isArray(parsedValue)) {
    return dataUriResult ?? { value, bytesRemoved: 0 };
  }

  const state = await transformStructuredValue(parsedValue, params, false);
  if (!state.changed) return dataUriResult ?? { value, bytesRemoved: 0 };

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

/**
 * Replaces every successfully processed Data URI in a string while preserving
 * invalid occurrences and all surrounding text. Does not mutate its input.
 */
async function replaceDataUris(
  value: string,
  params: TransformParams,
): Promise<{ value: string; bytesRemoved: number }> {
  params.onDetectionPath("data_uri", Buffer.byteLength(value, "utf8"));
  const occurrences = findDataUris(value);
  if (occurrences.length === 0) return { value, bytesRemoved: 0 };

  let output = "";
  let cursor = 0;
  let bytesRemoved = 0;

  for (const occurrence of occurrences) {
    const original = value.slice(occurrence.start, occurrence.end);
    output += value.slice(cursor, occurrence.start);
    if (occurrence.status === "invalid") {
      params.onInvalidCandidate("data_uri", occurrence.reason);
      output += original;
    } else if (occurrence.status === "ignored") {
      params.onIgnoredCandidate("data_uri", occurrence.reason);
      output += original;
    } else {
      const resolvedReplacement = await params.processCandidate(
        occurrence.candidate,
      );
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

/**
 * Locates Data URIs with a forward-only scanner. The cursor never moves
 * backwards, keeping adversarial inputs linear rather than relying on a large
 * backtracking regular expression.
 */
function findDataUris(value: string): DataUriOccurrence[] {
  const occurrences: DataUriOccurrence[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let start = value.indexOf(DATA_URI_PREFIX, cursor);
    if (start === -1) break;

    if (!hasPlausibleDataUriBoundary(value, start)) {
      occurrences.push({
        start,
        end: start + DATA_URI_PREFIX.length,
        status: "ignored",
        reason: "implausible_data_uri_prefix",
      });
      cursor = start + DATA_URI_PREFIX.length;
      continue;
    }

    let headerCursor = start + DATA_URI_PREFIX.length;
    let contentTypeEnd: number | undefined;
    let markerStart: number | undefined;
    while (headerCursor < value.length) {
      if (value.startsWith(DATA_URI_PREFIX, headerCursor)) {
        if (hasPlausibleDataUriBoundary(value, headerCursor)) {
          start = headerCursor;
          headerCursor += DATA_URI_PREFIX.length;
          contentTypeEnd = undefined;
          markerStart = undefined;
        } else {
          headerCursor += DATA_URI_PREFIX.length;
        }
        continue;
      }
      const code = value.charCodeAt(headerCursor);
      if (code === 44) break;
      if (code === 59) {
        contentTypeEnd ??= headerCursor;
        if (value.startsWith(BASE64_MARKER, headerCursor)) {
          markerStart = headerCursor;
          break;
        }
      }
      headerCursor += 1;
    }

    if (markerStart === undefined) {
      if (headerCursor === value.length) break;
      cursor = headerCursor + 1;
      continue;
    }

    const dataStart = markerStart + BASE64_MARKER.length;
    const contentType = value.slice(
      start + DATA_URI_PREFIX.length,
      contentTypeEnd ?? markerStart,
    );
    const header = value.slice(start + DATA_URI_PREFIX.length, markerStart);
    const invalidHeader = getInvalidDataUriHeaderReason(header, contentType);
    if (invalidHeader) {
      // Do not walk a potentially multi-megabyte body when its prefix already
      // proves that it cannot be uploaded.
      occurrences.push({ start, end: dataStart, ...invalidHeader });
      cursor = dataStart;
      continue;
    }

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

    const base64Data = value.slice(dataStart, end);

    if (base64Data.length === 0) {
      occurrences.push({
        start,
        end,
        status: "invalid",
        reason:
          end < value.length && !isDataUriTerminator(value.charCodeAt(end))
            ? "invalid_base64"
            : "empty_payload",
      });
    } else if (
      end < value.length &&
      !isDataUriTerminator(value.charCodeAt(end))
    ) {
      occurrences.push({
        start,
        end,
        status: "invalid",
        reason: "invalid_base64",
      });
    } else if (!valid) {
      occurrences.push({
        start,
        end,
        status: "invalid",
        reason: "invalid_base64_padding",
      });
    } else if (base64Data.length % 4 === 1) {
      occurrences.push({
        start,
        end,
        status: "invalid",
        reason: "invalid_base64_length",
      });
    } else {
      occurrences.push({
        start,
        end,
        status: "valid",
        candidate: {
          encodedData: base64Data,
          encoding: "base64",
          contentType: contentType as MediaContentType,
          kind: "data_uri",
          source: "base64_data_uri",
        },
      });
    }
    cursor = Math.max(end, dataStart);
  }

  return occurrences;
}

function getInvalidDataUriHeaderReason(
  header: string,
  contentType: string,
):
  | {
      status: "invalid";
      reason: "malformed_data_uri_header";
    }
  | {
      status: "ignored";
      reason: "unsupported_content_type";
    }
  | undefined {
  const parameters = header.slice(contentType.length);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(
      contentType,
    ) ||
    !/^(?:;[A-Za-z0-9!#$&^_.+-]+=[^;,\s"'<>[\]{}]+)*$/.test(parameters)
  ) {
    return { status: "invalid", reason: "malformed_data_uri_header" };
  }
  if (!isMediaContentType(contentType)) {
    return { status: "ignored", reason: "unsupported_content_type" };
  }
}

function hasPlausibleDataUriBoundary(value: string, start: number): boolean {
  if (start === 0) return true;
  const previousCode = value.charCodeAt(start - 1);
  return !(
    (previousCode >= 48 && previousCode <= 57) ||
    (previousCode >= 65 && previousCode <= 90) ||
    (previousCode >= 97 && previousCode <= 122) ||
    previousCode === 45 ||
    previousCode === 95
  );
}

function isDataUriTerminator(code: number): boolean {
  return (
    Number.isNaN(code) ||
    code === 9 ||
    code === 10 ||
    code === 13 ||
    code === 32 ||
    code === 34 ||
    code === 39 ||
    code === 41 ||
    code === 44 ||
    code === 62 ||
    code === 93 ||
    code === 125
  );
}

/**
 * Traverses a structured payload and mutates it in place for every successful
 * media replacement. Candidate operations run sequentially after discovery to
 * keep traversal stable and peak decoded-media memory bounded.
 */
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
  // Discover candidates before mutating the tree. This keeps traversal stable
  // even when a successful operation replaces a node that was just inspected.
  const operations: Array<() => Promise<void>> = [];
  const root: Record<string, unknown> = { value };
  // Use an explicit stack and depth limit so deeply nested user payloads cannot
  // exhaust the JavaScript call stack.
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
  // Avoid invoking user-controlled setters such as an own `__proto__` setter
  // when replacing values inside parsed or SDK-provided payloads.
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

/**
 * Processes one recognized provider media object and mutates its media property
 * in place only when the candidate resolves to a media reference.
 */
async function replaceStructuredMedia(
  media: StructuredMedia,
  params: TransformParams,
): Promise<number | undefined> {
  if (isMediaReference(media.content) || isRemoteUrl(media.content)) return;

  const candidate = parseStructuredMediaCandidate(media);
  if (candidate.status === "ignored") {
    params.onIgnoredCandidate(media.kind, candidate.reason);
    return;
  }
  if (candidate.status === "invalid") {
    params.onInvalidCandidate(media.kind, candidate.reason);
    return;
  }

  const replacement = await params.processCandidate(candidate.candidate);
  if (replacement) {
    defineOwnValue(media.target, media.property, replacement);
    return Math.max(
      0,
      Buffer.byteLength(media.content, "utf8") -
        Buffer.byteLength(replacement, "utf8"),
    );
  }
}

function parseStructuredMediaCandidate(
  media: StructuredMedia,
):
  | { status: "valid"; candidate: MediaPayloadCandidate }
  | { status: "invalid"; reason: MediaInvalidReason }
  | { status: "ignored"; reason: MediaIgnoredReason } {
  if (!isMediaContentType(media.contentType)) {
    return { status: "ignored", reason: "unsupported_content_type" };
  }

  if (media.content.startsWith(DATA_URI_PREFIX)) {
    const occurrences = findDataUris(media.content);
    const occurrence =
      occurrences.length === 1 &&
      occurrences[0]?.start === 0 &&
      occurrences[0]?.end === media.content.length
        ? occurrences[0]
        : undefined;
    if (!occurrence) {
      return { status: "invalid", reason: "invalid_base64" };
    }
    if (occurrence.status !== "valid") return occurrence;
    return {
      status: "valid",
      candidate: {
        ...occurrence.candidate,
        contentType: media.contentType,
        kind: media.kind,
        source: "bytes",
      },
    };
  }

  if (isPythonBytesLiteral(media.content)) {
    return {
      status: "valid",
      candidate: {
        encodedData: media.content,
        encoding: "python_bytes_literal",
        contentType: media.contentType,
        kind: media.kind,
        source: "bytes",
      },
    };
  }

  return isValidBase64(media.content)
    ? {
        status: "valid",
        candidate: {
          encodedData: media.content,
          encoding: "base64",
          contentType: media.contentType,
          kind: media.kind,
          source: "bytes",
        },
      }
    : { status: "invalid", reason: "invalid_base64" };
}

function isPythonBytesLiteral(value: string): boolean {
  const quote = value[1];
  return (
    value.length >= 3 &&
    value[0] === "b" &&
    (quote === "'" || quote === '"') &&
    value.at(-1) === quote
  );
}

/**
 * Cheaply requires a complete provider-specific key combination before the
 * more expensive JSON.parse and structured traversal. A common `data` key by
 * itself is deliberately insufficient.
 */
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
