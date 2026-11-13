import { claimed, dropped, unmatched } from "../..";
import { asRecord, compact, optionalString } from "../../../core/utils/json";
import {
  filePartFromMediaReference,
  filePartFromUrl,
  parseMediaReference,
} from "../../../core/normalize/message-parts/media";
import { toolCallPart } from "../../../core/normalize/message-parts/tool-calls";
import type {
  FilePart,
  FinishReason,
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandler,
  PartHandlerContext,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * OTel GenAI event-stream convention (the semconv vocabulary also emitted by
 * Traceloop/OpenLLMetry and koog-style conversions): this module owns
 * choice-event envelopes, the snake_case `tool_call`/`tool_call_response`
 * types no SDK's own vocabulary claims, the semconv `blob`/`uri`/`file` media
 * parts, and the `gen_ai.tool.definitions`/`llm.tools.N` attribute carriers.
 */
function normalizeOtelGenaiToolResult(
  value: Record<string, unknown>,
  context: PartHandlerContext,
): ConventionResult<NormalizedMessagePart[]> {
  // GenAI carriers can retain AI SDK output envelopes. Delegate their contents
  // to the existing tool-result handler after translating the carrier fields.
  return claimed(
    context.normalizePartValue({
      type: "tool-result",
      toolCallId:
        value.toolCallId /* ai sdk */ ??
        value.tool_use_id /* anthropic */ ??
        value.call_id /* openai responses */ ??
        value.id,
      toolName: value.toolName /* ai sdk */ ?? value.tool_name /* otel */,
      output:
        value.output /* ai sdk, openai responses */ ??
        value.response /* gemini */ ??
        value.result /* loose/traceloop */ ??
        value.content /* anthropic, openai chat message */,
      isError: [
        value.is_error /* anthropic */,
        value.isError /* ai sdk */,
      ].find((candidate) => typeof candidate === "boolean"),
    }),
  );
}

const OTEL_GENAI_FINISH_REASON_TYPE_BY_RAW: Record<
  string,
  FinishReason["type"]
> = {
  tool_call: "tool-calls",
};

const OTEL_GENAI_PART_HANDLERS = {
  tool_call: (value: Record<string, unknown>) =>
    claimed(
      toolCallPart({
        toolCallId: value.toolCallId /* ai sdk */ ?? value.call_id ?? value.id,
        toolName: value.toolName /* ai sdk */ ?? value.name,
        input:
          value.input ??
          value.arguments /* otel */ ??
          value.args /* langchain */,
        toolType: optionalString(value.type),
      }),
    ),
  tool_call_response: normalizeOtelGenaiToolResult,
  blob: normalizeOtelGenaiBlob,
  uri: normalizeOtelGenaiUri,
  file: normalizeOtelGenaiFile,
} satisfies Readonly<Record<string, PartHandler>>;

/** GenAI choice events: `{index?, message, finish_reason?}`. */
function unwrapOtelGenaiChoiceEvent(
  value: Record<string, unknown>,
  fallbackRole: "user" | "assistant",
  ctx: MessageEnvelopeContext,
): ConventionResult<NormalizedMessage> {
  if (ctx.isMessageLike(value)) return unmatched;
  const nestedMessage = asRecord(value.message);
  if (!nestedMessage) return unmatched;

  const message = ctx.normalizeMessage(nestedMessage, fallbackRole);
  if (!message) return dropped;

  const finishReason = ctx.normalizeFinishReason(value) ?? message.finishReason;
  return claimed(compact({ ...message, finishReason }));
}

/**
 * Tool definitions among span attributes: the semconv
 * `gen_ai.tool.definitions` list, and Traceloop/OpenLLMetry's indexed
 * `llm.tools.N.tool.json_schema` keys (returned in index order).
 */
function otelGenaiToolDefinitionSources(
  carrier: ToolDefinitionCarrier,
): ToolDefinitionSource[] {
  const attributes = carrier.metadataAttributes;
  if (!attributes) return [];

  const sources: ToolDefinitionSource[] = [];

  if (attributes["gen_ai.tool.definitions"] !== undefined) {
    sources.push({
      sourceKey: "gen_ai.tool.definitions",
      value: attributes["gen_ai.tool.definitions"],
      options: { allowToolMap: true },
    });
  }

  const indexedToolKeys = Object.keys(attributes)
    .map((key) => ({
      key,
      index: /^llm\.tools\.(\d+)\.tool\.json_schema$/.exec(key)?.[1],
    }))
    .filter(
      (entry): entry is { key: string; index: string } =>
        entry.index !== undefined,
    )
    .sort((left, right) => Number(left.index) - Number(right.index));
  for (const { key } of indexedToolKeys) {
    sources.push({ sourceKey: key, value: attributes[key] });
  }

  return sources;
}

export const otelGenaiProvider = {
  name: "otel-genai",
  finishReasonTypeByRaw: OTEL_GENAI_FINISH_REASON_TYPE_BY_RAW,
  typedParts: OTEL_GENAI_PART_HANDLERS,
  tryUnwrapMessage: unwrapOtelGenaiChoiceEvent,
  // koog/Traceloop role-"tool" turns that are actually tool *definitions*
  // (an OpenAI function-tool wrapper with no tool_call_id) — not content.
  isToolDefinitionMessage: (message: Record<string, unknown>) => {
    const content = asRecord(message.content);
    return Boolean(
      message.role === "tool" &&
      content?.type === "function" &&
      content.function &&
      !message.tool_call_id,
    );
  },
  collectToolDefinitionSources: otelGenaiToolDefinitionSources,
} satisfies IOConvention;

/** Semconv `blob` parts: inline base64 `content`, or a media reference token
 * once ingestion has uploaded the payload. */
function normalizeOtelGenaiBlob(
  value: Record<string, unknown>,
): ConventionResult<NormalizedMessagePart> {
  const content = optionalString(value.content);
  if (!content) return unmatched;
  const reference = parseMediaReference(content);
  if (reference) return claimed(filePartFromMediaReference(reference));
  return claimed(
    compact<FilePart>({
      type: "file",
      mediaType:
        optionalString(value.mime_type) ?? semconvModalityMediaType(value),
      content: { kind: "base64", data: content },
    }),
  );
}

function normalizeOtelGenaiUri(
  value: Record<string, unknown>,
): ConventionResult<NormalizedMessagePart> {
  const uri = optionalString(value.uri);
  if (!uri) return unmatched;
  return claimed(
    filePartFromUrl(uri, {
      mediaType: optionalString(value.mime_type),
      fallbackMediaType: semconvModalityMediaType(value),
    }),
  );
}

/** Semconv `file` parts carry a flat `file_id`. OpenAI chat `file` wrappers
 * and AI SDK `data`/`url` files on the same type name fall through. */
function normalizeOtelGenaiFile(
  value: Record<string, unknown>,
): ConventionResult<NormalizedMessagePart> {
  const fileId = optionalString(value.file_id);
  if (!fileId || asRecord(value.file)) return unmatched;
  return claimed(
    compact<FilePart>({
      type: "file",
      mediaType:
        optionalString(value.mime_type) ?? semconvModalityMediaType(value),
      content: { kind: "reference", id: fileId },
    }),
  );
}

/** Semconv `modality` as a media-type wildcard, for parts without `mime_type`. */
function semconvModalityMediaType(
  value: Record<string, unknown>,
): string | undefined {
  const modality = optionalString(value.modality);
  return modality === "image" || modality === "video" || modality === "audio"
    ? `${modality}/*`
    : undefined;
}
