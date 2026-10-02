import { claimed, dropped, unmatched } from "../..";
import { asRecord, compact, optionalString } from "../../../core/utils/json";
import { toolCallPart } from "../../../core/normalize/message-parts/tool-calls";
import { toolResultPart } from "../../../core/normalize/message-parts/tool-results";
import type {
  FinishReason,
  NormalizedMessage,
  ToolResultPart,
} from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandler,
  ToolDefinitionCarrier,
  ToolDefinitionSource,
} from "../../io-convention";

/**
 * OTel GenAI event-stream convention (the semconv vocabulary also emitted by
 * Traceloop/OpenLLMetry and koog-style conversions): this module owns
 * choice-event envelopes, the snake_case `tool_call`/`tool_call_response`
 * types no SDK's own vocabulary claims, and the `gen_ai.tool.definitions`/
 * `llm.tools.N` attribute carriers.
 */
function normalizeOtelGenaiToolResult(
  value: Record<string, unknown>,
): ConventionResult<ToolResultPart> {
  return claimed(
    toolResultPart({
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
      ].find((candidate) => typeof candidate === "boolean") as
        | boolean
        | undefined,
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
  tool_call_response: (value: Record<string, unknown>) =>
    normalizeOtelGenaiToolResult(value),
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
