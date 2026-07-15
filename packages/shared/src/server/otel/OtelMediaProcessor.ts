import {
  isMediaContentType,
  type MediaContentType,
  type MediaField,
} from "../../domain/media";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import type { UploadMediaForTraceResult } from "../media";
import type { ResourceSpan } from "./OtelIngestionProcessor";

const MAX_RECURSION_DEPTH = 10;
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const MEDIA_REFERENCE_SUFFIX = "@@@";
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const DATA_URI_PATTERN = /data:[^;]+;base64,[A-Za-z0-9+/]+=*/g;

const INPUT_MEDIA_ATTRIBUTE_KEYS = new Set([
  "langfuse.trace.input",
  "langfuse.observation.input",
  "ai.prompt.messages",
  "ai.prompt",
  "ai.toolCall.args",
  "gcp.vertex.agent.llm_request",
  "gcp.vertex.agent.tool_call_args",
  "prompt",
  "lk.input_text",
  "lk.user_transcript",
  "lk.chat_ctx",
  "lk.user_input",
  "mlflow.spanInputs",
  "traceloop.entity.input",
  "input.value",
  "pydantic_ai.all_messages",
  "gen_ai.system_instructions",
  "input",
  "gen_ai.input.messages",
  "gen_ai.tool.call.arguments",
  "genkit:input",
  "tool_arguments",
]);

const OUTPUT_MEDIA_ATTRIBUTE_KEYS = new Set([
  "langfuse.trace.output",
  "langfuse.observation.output",
  "ai.response.text",
  "ai.result.text",
  "ai.toolCall.result",
  "ai.response.object",
  "ai.result.object",
  "ai.response.toolCalls",
  "ai.result.toolCalls",
  "gcp.vertex.agent.llm_response",
  "gcp.vertex.agent.tool_response",
  "all_messages_events",
  "lk.function_tool.output",
  "lk.response.text",
  "mlflow.spanOutputs",
  "traceloop.entity.output",
  "output.value",
  "final_result",
  "output",
  "gen_ai.output.messages",
  "gen_ai.tool.call.result",
  "genkit:output",
  "tool_response",
]);

const INPUT_MEDIA_ATTRIBUTE_PREFIXES = ["gen_ai.prompt", "llm.input_messages"];
const OUTPUT_MEDIA_ATTRIBUTE_PREFIXES = [
  "gen_ai.completion",
  "llm.output_messages",
];

export type OtelMediaKind =
  | "data_uri"
  | "anthropic"
  | "vertex"
  | "gemini"
  | "ai_sdk_v6"
  | "ai_sdk_v7";

export type UploadOtelMedia = (params: {
  projectId: string;
  traceId: string;
  observationId: string;
  field: MediaField;
  contentType: MediaContentType;
  contentBytes: Buffer;
  mediaBucket: string;
  mediaPrefix: string;
}) => Promise<UploadMediaForTraceResult>;

type MediaSource = "base64_data_uri" | "bytes";

type MediaCandidate = {
  base64Data: string;
  contentType: MediaContentType;
  kind: OtelMediaKind;
  source: MediaSource;
};

type ProcessResult = {
  uploaded: number;
  reused: number;
  invalid: number;
  failed: number;
  bytesRemoved: number;
};

type ProcessContext = {
  projectId: string;
  traceId: string;
  observationId: string;
  field: MediaField;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
  result: ProcessResult;
};

type TransformResult = {
  value: unknown;
  changed: boolean;
};

export async function processOtelMedia(params: {
  resourceSpans: ResourceSpan[];
  projectId: string;
  mediaBucket: string;
  mediaPrefix: string;
  uploadMedia: UploadOtelMedia;
}): Promise<ProcessResult> {
  const { resourceSpans, projectId, mediaBucket, mediaPrefix, uploadMedia } =
    params;
  const result: ProcessResult = {
    uploaded: 0,
    reused: 0,
    invalid: 0,
    failed: 0,
    bytesRemoved: 0,
  };

  for (const resourceSpan of resourceSpans) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        const traceId = parseOtelId(span.traceId);
        const observationId = parseOtelId(span.spanId);

        if (!traceId || !observationId) {
          continue;
        }

        for (const attribute of span.attributes ?? []) {
          await processOtelAnyValue(attribute.value, {
            projectId,
            traceId,
            observationId,
            field: mediaFieldForAttribute(attribute.key),
            mediaBucket,
            mediaPrefix,
            uploadMedia,
            result,
          });
        }

        for (const event of span.events ?? []) {
          for (const attribute of event.attributes ?? []) {
            await processOtelAnyValue(attribute.value, {
              projectId,
              traceId,
              observationId,
              field: mediaFieldForAttribute(attribute.key),
              mediaBucket,
              mediaPrefix,
              uploadMedia,
              result,
            });
          }
        }
      }
    }
  }

  return result;
}

async function processOtelAnyValue(
  value: Record<string, unknown> | undefined,
  context: ProcessContext,
): Promise<void> {
  if (!value) return;

  if (typeof value.stringValue === "string") {
    const originalValue = value.stringValue;
    const processedValue = await processMediaString(originalValue, context);

    if (processedValue !== originalValue) {
      value.stringValue = processedValue;
      const bytesRemoved =
        Buffer.byteLength(originalValue, "utf8") -
        Buffer.byteLength(processedValue, "utf8");
      if (bytesRemoved > 0) {
        context.result.bytesRemoved += bytesRemoved;
        recordDistribution(
          "langfuse.ingestion.otel.media.bytes_removed",
          bytesRemoved,
        );
      }
    }
    return;
  }

  const arrayValues = (
    value.arrayValue as { values?: Array<Record<string, unknown>> } | undefined
  )?.values;
  if (arrayValues) {
    for (const arrayValue of arrayValues) {
      await processOtelAnyValue(arrayValue, context);
    }
  }
}

async function processMediaString(
  value: string,
  context: ProcessContext,
): Promise<string> {
  if (isMediaReference(value)) return value;

  let valueWithMediaReferences = value;
  const dataUris = [...new Set(value.match(DATA_URI_PATTERN) ?? [])];
  for (const dataUri of dataUris) {
    const candidate = parseDataUri(dataUri, "data_uri", "base64_data_uri");
    if (!candidate) {
      recordInvalidCandidate("data_uri", context);
      continue;
    }

    const replacement = await processCandidate(candidate, context);
    if (replacement) {
      valueWithMediaReferences = valueWithMediaReferences.replaceAll(
        dataUri,
        replacement,
      );
    }
  }
  if (dataUris.length > 0) {
    return valueWithMediaReferences;
  }
  if (value.startsWith("data:")) {
    recordInvalidCandidate("data_uri", context);
    return value;
  }

  const strippedValue = value.trimStart();
  if (!strippedValue.startsWith("{") && !strippedValue.startsWith("[")) {
    return value;
  }
  if (!mayContainSerializedMedia(value)) return value;

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    return value;
  }

  if (!isObject(parsedValue) && !Array.isArray(parsedValue)) return value;

  const transformed = await transformValue(
    parsedValue,
    context,
    new WeakSet<object>(),
    1,
  );
  return transformed.changed ? JSON.stringify(transformed.value) : value;
}

async function transformValue(
  value: unknown,
  context: ProcessContext,
  seen: WeakSet<object>,
  depth: number,
): Promise<TransformResult> {
  if (depth > MAX_RECURSION_DEPTH) return { value, changed: false };

  if (typeof value === "string") {
    if (isMediaReference(value)) return { value, changed: false };
    const candidate = parseDataUri(value, "data_uri", "base64_data_uri");
    if (!candidate) {
      if (value.startsWith("data:")) {
        recordInvalidCandidate("data_uri", context);
      }
      return { value, changed: false };
    }

    const replacement = await processCandidate(candidate, context);
    return replacement
      ? { value: replacement, changed: true }
      : { value, changed: false };
  }

  if (!isObject(value) && !Array.isArray(value)) {
    return { value, changed: false };
  }
  if (seen.has(value)) return { value, changed: false };
  seen.add(value);

  if (isObject(value)) {
    const special = await transformStructuredMedia(value, context);
    if (special.matched) {
      return { value, changed: special.changed };
    }
  }

  let changed = false;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const transformed = await transformValue(
        value[index],
        context,
        seen,
        depth + 1,
      );
      if (transformed.changed) {
        value[index] = transformed.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const transformed = await transformValue(
      nestedValue,
      context,
      seen,
      depth + 1,
    );
    if (transformed.changed) {
      value[key] = transformed.value;
      changed = true;
    }
  }
  return { value, changed };
}

async function transformStructuredMedia(
  value: Record<string, unknown>,
  context: ProcessContext,
): Promise<{ matched: boolean; changed: boolean }> {
  if (
    value.type === "base64" &&
    typeof value.media_type === "string" &&
    typeof value.data === "string"
  ) {
    return replaceStructuredMedia({
      target: value,
      property: "data",
      content: value.data,
      contentType: value.media_type,
      kind: "anthropic",
      context,
    });
  }

  if (
    value.type === "media" &&
    typeof value.mime_type === "string" &&
    typeof value.data === "string"
  ) {
    return replaceStructuredMedia({
      target: value,
      property: "data",
      content: value.data,
      contentType: value.mime_type,
      kind: "vertex",
      context,
    });
  }

  if (value.type === "file" && typeof value.mediaType === "string") {
    const property =
      typeof value.data === "string"
        ? "data"
        : typeof value.image === "string"
          ? "image"
          : undefined;
    if (!property) return { matched: true, changed: false };

    return replaceStructuredMedia({
      target: value,
      property,
      content: value[property] as string,
      contentType: value.mediaType,
      kind: "ai_sdk_v6",
      context,
    });
  }

  if (
    value.type === "blob" &&
    typeof value.mime_type === "string" &&
    typeof value.content === "string"
  ) {
    return replaceStructuredMedia({
      target: value,
      property: "content",
      content: value.content,
      contentType: value.mime_type,
      kind: "ai_sdk_v7",
      context,
    });
  }

  for (const inlineDataKey of ["inline_data", "inlineData"] as const) {
    const inlineData = value[inlineDataKey];
    if (!isObject(inlineData) || typeof inlineData.data !== "string") continue;

    const contentType = inlineData.mime_type ?? inlineData.mimeType;
    if (typeof contentType !== "string") continue;

    return replaceStructuredMedia({
      target: inlineData,
      property: "data",
      content: inlineData.data,
      contentType,
      kind: "gemini",
      context,
    });
  }

  return { matched: false, changed: false };
}

async function replaceStructuredMedia(params: {
  target: Record<string, unknown>;
  property: string;
  content: string;
  contentType: string;
  kind: Exclude<OtelMediaKind, "data_uri">;
  context: ProcessContext;
}): Promise<{ matched: true; changed: boolean }> {
  const { target, property, content, contentType, kind, context } = params;
  if (isMediaReference(content) || isRemoteUrl(content)) {
    return { matched: true, changed: false };
  }

  const candidate = parseRawBase64(content, contentType, kind);
  if (!candidate) {
    recordInvalidCandidate(kind, context);
    return { matched: true, changed: false };
  }

  const replacement = await processCandidate(candidate, context);
  if (!replacement) return { matched: true, changed: false };

  target[property] = replacement;
  return { matched: true, changed: true };
}

function parseRawBase64(
  value: string,
  contentType: string,
  kind: Exclude<OtelMediaKind, "data_uri">,
): MediaCandidate | undefined {
  if (!isMediaContentType(contentType)) return;

  if (value.startsWith("data:")) {
    const dataUri = parseDataUri(value, kind, "bytes");
    if (!dataUri) return;
    return { ...dataUri, contentType };
  }

  if (!isValidBase64(value)) return;
  return {
    base64Data: value,
    contentType,
    kind,
    source: "bytes",
  };
}

function parseDataUri(
  value: string,
  kind: OtelMediaKind,
  source: MediaSource,
): MediaCandidate | undefined {
  if (!value.startsWith("data:")) return;

  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) return;

  const headerParts = value.slice(5, commaIndex).split(";");
  const contentType = headerParts[0];
  const base64Data = value.slice(commaIndex + 1);
  if (
    !headerParts.includes("base64") ||
    !isMediaContentType(contentType) ||
    !isValidBase64(base64Data)
  ) {
    return;
  }

  return { base64Data, contentType, kind, source };
}

async function processCandidate(
  candidate: MediaCandidate,
  context: ProcessContext,
): Promise<string | undefined> {
  // Give BullMQ's timers a chance to renew the lock before decoding a large
  // base64 value. Uploads remain sequential because each candidate is awaited.
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

    return `@@@langfuseMedia:type=${candidate.contentType}|id=${uploadResult.mediaId}|source=${candidate.source}@@@`;
  } catch (error) {
    context.result.failed += 1;
    recordIncrement("langfuse.ingestion.otel.media", 1, {
      outcome: "failed",
      media_kind: candidate.kind,
    });
    logger.warn("OTEL media upload failed; leaving span value unchanged", {
      projectId: context.projectId,
      traceId: context.traceId,
      observationId: context.observationId,
      field: context.field,
      mediaKind: candidate.kind,
      mediaBytes: contentBytes.length,
      error,
    });
    return;
  }
}

function recordInvalidCandidate(
  kind: OtelMediaKind,
  context: ProcessContext,
): void {
  context.result.invalid += 1;
  recordIncrement("langfuse.ingestion.otel.media", 1, {
    outcome: "invalid",
    media_kind: kind,
  });
}

function mediaFieldForAttribute(attributeKey: string): MediaField {
  if (
    INPUT_MEDIA_ATTRIBUTE_KEYS.has(attributeKey) ||
    INPUT_MEDIA_ATTRIBUTE_PREFIXES.some((prefix) =>
      attributeKey.startsWith(prefix),
    )
  ) {
    return "input";
  }
  if (
    OUTPUT_MEDIA_ATTRIBUTE_KEYS.has(attributeKey) ||
    OUTPUT_MEDIA_ATTRIBUTE_PREFIXES.some((prefix) =>
      attributeKey.startsWith(prefix),
    )
  ) {
    return "output";
  }
  return "metadata";
}

function mayContainSerializedMedia(value: string): boolean {
  if (
    value.includes("data:") ||
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
  return (
    value.length > 0 && value.length % 4 !== 1 && BASE64_PATTERN.test(value)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOtelId(value: unknown): string {
  if (typeof value === "string") return value;

  const data = isObject(value) && value.data !== undefined ? value.data : value;
  try {
    return Buffer.from(data as Uint8Array).toString("hex");
  } catch {
    return "";
  }
}
