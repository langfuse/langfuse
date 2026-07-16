import type { MediaContentType, MediaField } from "../../domain/media";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import {
  transformMediaPayload,
  type MediaPayloadCandidate,
  type MediaPayloadKind,
} from "../media/MediaPayloadProcessor";
import type { UploadMediaForTraceResult } from "../media/mediaService";
import type { ResourceSpan } from "./OtelIngestionProcessor";

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

const ATTRIBUTE_PREFIXES: Array<[string, MediaField]> = [
  ["gen_ai.prompt", "input"],
  ["llm.input_messages", "input"],
  ["gen_ai.completion", "output"],
  ["llm.output_messages", "output"],
  ["langfuse.trace.metadata", "metadata"],
  ["langfuse.observation.metadata", "metadata"],
  ["langfuse.metadata", "metadata"],
  ["ai.telemetry.metadata", "metadata"],
];

export type OtelMediaKind = MediaPayloadKind;

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
        if (!traceId || !observationId) continue;

        for (const attribute of span.attributes ?? []) {
          const field = mediaFieldForAttribute(attribute.key);
          if (!field) continue;
          await processOtelAnyValue(attribute.value, {
            projectId,
            traceId,
            observationId,
            field,
            mediaBucket,
            mediaPrefix,
            uploadMedia,
            result,
          });
        }

        for (const event of span.events ?? []) {
          for (const attribute of event.attributes ?? []) {
            const field = mediaFieldForAttribute(attribute.key);
            if (!field) continue;
            await processOtelAnyValue(attribute.value, {
              projectId,
              traceId,
              observationId,
              field,
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
    const processedValue = await transformMediaPayload(originalValue, {
      processCandidate: (candidate) => processCandidate(candidate, context),
      onInvalidCandidate: (kind) => recordInvalidCandidate(kind, context),
      onDetectionPath: (path) =>
        recordIncrement("langfuse.ingestion.otel.media.detection_check", 1, {
          path,
        }),
    });

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
  for (const arrayValue of arrayValues ?? []) {
    await processOtelAnyValue(arrayValue, context);
  }
}

async function processCandidate(
  candidate: MediaPayloadCandidate,
  context: ProcessContext,
): Promise<string | undefined> {
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
  }
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

function mediaFieldForAttribute(attributeKey: string): MediaField | undefined {
  if (INPUT_MEDIA_ATTRIBUTE_KEYS.has(attributeKey)) return "input";
  if (OUTPUT_MEDIA_ATTRIBUTE_KEYS.has(attributeKey)) return "output";

  for (const [prefix, field] of ATTRIBUTE_PREFIXES) {
    if (attributeKey === prefix || attributeKey.startsWith(`${prefix}.`)) {
      return field;
    }
  }
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
