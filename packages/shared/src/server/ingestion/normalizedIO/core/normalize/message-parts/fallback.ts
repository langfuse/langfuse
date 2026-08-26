import { NormalizedMessagePart } from "../../../types";
import { asRecord, omitKeys, toJsonValue } from "../../utils/json";
import { toolCallPart } from "./toolCalls";

// `type` strings that count as tool-call evidence for the flat sniff below,
// by owner. The flattening itself has no single emitter (OTel GenAI event
// payloads, koog/Traceloop conversions, frameworks that unwrap the OpenAI
// `function` wrapper) — only the markers do.
const FLAT_TOOL_CALL_TYPE_MARKERS = new Set([
  "function",
  "function_call", // openai
  "tool-call", // ai sdk
  "tool_call", // otel genai, langchain
  "tool_use",
  "server_tool_use",
  "mcp_tool_use", // anthropic
]);

/**
 * Shape-sniffed tool calls without a matched typed/untyped case:
 * OpenAI's `{function: {name, arguments}}` wrapper, Responses' flat
 * `{call_id, name, arguments}`, AI SDK's `{toolName, input | args}`, and the
 * bare `{name, arguments, <id | index | marker>}` shape loose instrumentation
 * emits. Recognition and extraction are one function: `undefined` means the
 * value is not call-shaped (fallback continues); `null` means call-shaped
 * but unconstructible (dropped). Guarded — bare `{name, arguments}` alone
 * never matches. This is the deliberate field-vocabulary join for shapes
 * whose dialect is unknown; owner comments per field.
 */
function sniffLooseToolCall(
  value: Record<string, unknown>,
): NormalizedMessagePart | null | undefined {
  if (value.type === "tool-result") return undefined;

  const functionCall = asRecord(value.function);
  const isCallShaped =
    Boolean(functionCall?.name && "arguments" in functionCall) || // openai chat completions
    Boolean(value.call_id && value.name && "arguments" in value) || // openai responses
    Boolean(
      value.toolName && // ai sdk
      (value.type === "tool-call" ||
        value.type === "tool_call" ||
        "input" in value ||
        "args" in value),
    ) ||
    Boolean(
      value.name &&
      "arguments" in value &&
      ("id" in value ||
        "index" in value ||
        FLAT_TOOL_CALL_TYPE_MARKERS.has(String(value.type))),
    );
  if (!isCallShaped) return undefined;

  return toolCallPart({
    toolCallId:
      value.toolCallId /* ai sdk */ ??
      value.call_id /* openai responses */ ??
      value.id,
    toolName:
      value.toolName /* ai sdk */ ??
      value.name /* anthropic, gemini, openai responses */ ??
      functionCall?.name,
    input:
      value.input /* anthropic, ai sdk */ ??
      value.arguments /* openai, otel */ ??
      value.args /* ai sdk, langchain */ ??
      functionCall?.arguments,
    index: value.index, // openai chat completions streaming
    providerExecuted: value.providerExecuted, // ai sdk
  });
}

export function normalizeFallbackPart(
  value: Record<string, unknown>,
): NormalizedMessagePart | null {
  const sniffed = sniffLooseToolCall(value);
  if (sniffed !== undefined) return sniffed;

  if (typeof value.type !== "string") {
    return { type: "data", value: toJsonValue(value) };
  }

  // Anthropic cache_control is a request transport hint, not conversation
  // content — stripped universally so it never leaks into an unknown
  // block's custom-part payload.
  return {
    type: "custom",
    kind: value.type,
    value: toJsonValue(omitKeys(value, ["cache_control"])),
  };
}
