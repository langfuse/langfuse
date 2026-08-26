import { claimed, registeredProviders } from "../conventions";
import type {
  PartHandler,
  PartHandlerContext,
} from "../conventions/IOConvention";
import {
  asRecord,
  isRecord,
  omitKeys,
  optionalString,
  parseArray,
  toJsonValue,
  toProviderMetadata,
} from "../json";
import type { JsonValue, NormalizedMessagePart } from "../types";
import {
  filePartFromMediaReference,
  normalizePartsFromString,
  parseMediaReference,
} from "./media";
import { reasoningPart, toolCallPart } from "./normalizers";

/**
 * Part dispatch. Typed parts are claimed exclusively by one handler; a
 * message may still contain parts from several provider dialects. Shared
 * type names are handled once here, while provider-specific names are looked
 * up in the convention registry.
 */

/** Citation carriers are provider vocabulary (`citationKeys`); the first
 * non-empty carrier lifts verbatim into `providerMetadata.citations`. */
export function extractCitations(
  value: Record<string, unknown>,
): JsonValue | undefined {
  for (const provider of registeredProviders) {
    for (const key of provider.citationKeys ?? []) {
      const citations = parseArray(value[key]);
      if (citations && citations.length > 0) return toJsonValue(citations);
    }
  }
  return undefined;
}

/** Universal text block: OpenAI Responses `input_text`/`output_text` share
 * this shape with the generic `text` type; Gemini's typed thought flag is
 * checked the same way regardless of which of the three type strings matched. */
function normalizeTextPart(
  value: Record<string, unknown>,
): NormalizedMessagePart {
  const text = optionalString(value.text ?? value.content) ?? "";
  if (value.thought === true) {
    return reasoningPart(
      text,
      optionalString(value.thoughtSignature ?? value.thought_signature),
    );
  }
  const citations = extractCitations(value);
  return {
    type: "text",
    text,
    ...(citations ? { providerMetadata: { citations } } : {}),
  };
}

/** Universal reasoning-text block: `reasoning`/`reasoning_text`/`summary_text`
 * all carry their payload under one of text/content/thinking/summary. */
function normalizeReasoningTextPart(
  value: Record<string, unknown>,
): NormalizedMessagePart {
  const reasoning =
    value.text ?? value.content ?? value.thinking ?? value.summary;
  return reasoningPart(reasoning);
}

// `image` and `file` are contested type names: Anthropic/AI-SDK and
// OpenAI/AI-SDK register guarded handlers for them in their own conventions;
// a handler returning `unmatched` falls through to the next provider.
export const SHARED_TYPED_PART_HANDLERS: Readonly<Record<string, PartHandler>> =
  {
    text: (value) => claimed(normalizeTextPart(value)),
    input_text: (value) => claimed(normalizeTextPart(value)),
    output_text: (value) => claimed(normalizeTextPart(value)),
    reasoning: (value) => claimed(normalizeReasoningTextPart(value)),
  };

/** Value-array -> parts mapper handed to providers as `context.normalizeParts`. */
export function normalizeParts(values: unknown[]): NormalizedMessagePart[] {
  const parts: NormalizedMessagePart[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      parts.push(...normalizePartsFromString(value));
      continue;
    }

    const part = normalizeMessagePart(value);
    if (!part) continue;

    // Text parts frequently embed media reference tokens mid-string; split
    // them out. Refusals and annotated text stay intact.
    if (part.type === "text" && !part.providerMetadata && !part.refusal) {
      parts.push(...normalizePartsFromString(part.text));
      continue;
    }
    parts.push(part);
  }
  return parts;
}

const partContext: PartHandlerContext = {
  normalizePart: normalizeMessagePart,
  normalizeParts,
};

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

function normalizeFallbackPart(
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

function normalizePart(value: unknown): NormalizedMessagePart | null {
  if (typeof value === "string") {
    const mediaReference = parseMediaReference(value);
    if (mediaReference) return filePartFromMediaReference(mediaReference);
    return { type: "text", text: value };
  }
  if (!isRecord(value)) return null;

  const type = typeof value.type === "string" ? value.type : undefined;
  if (type) {
    const sharedHandler = SHARED_TYPED_PART_HANDLERS[type];
    if (sharedHandler) {
      const result = sharedHandler(value, partContext);
      if (result.matched) return result.value;
    }

    for (const provider of registeredProviders) {
      const handler = provider.typedParts?.[type];
      if (!handler) continue;
      const result = handler(value, partContext);
      if (result.matched) return result.value;
    }
  } else {
    for (const provider of registeredProviders) {
      const result = provider.tryNormalizeUntypedPart?.(value, partContext);
      if (result?.matched) return result.value;
    }
  }

  return normalizeFallbackPart(value);
}

/**
 * AI SDK carries provider extras as `providerOptions` on every part —
 * promoted here, in the one choke point every path shares (content arrays,
 * standalone items, direct tool parts).
 */
function withProviderOptions<T extends NormalizedMessagePart>(
  part: T,
  value: Record<string, unknown>,
): T {
  const providerOptions = asRecord(value.providerOptions);
  if (!providerOptions) return part;

  const providerMetadata = toProviderMetadata({
    ...providerOptions,
    ...part.providerMetadata,
  });
  return { ...part, providerMetadata } as T;
}

export function normalizeMessagePart(
  value: unknown,
): NormalizedMessagePart | null {
  const part = normalizePart(value);
  return part && isRecord(value) ? withProviderOptions(part, value) : part;
}

/** `true` when normalizing `value` yields a tool-call or tool-result part —
 * replaces shape-probing predicates with normalize-then-inspect. */
export function isToolPartValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const part = normalizeMessagePart(value);
  return part?.type === "tool-call" || part?.type === "tool-result";
}
