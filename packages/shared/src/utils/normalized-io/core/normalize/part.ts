import { claimed } from "../../conventions";
import type {
  PartHandler,
  PartHandlerContext,
} from "../../conventions/io-convention";
import type { NormalizedMessagePart } from "../../types";
import {
  asRecord,
  isRecord,
  ownLookup,
  remainingProviderMetadata,
} from "../utils/json";
import { normalizeFallbackPart } from "./message-parts/fallback";
import {
  filePartFromMediaReference,
  normalizeMediaPartsFromString,
  parseMediaReference,
} from "./message-parts/media";
import { normalizeReasoningTextPart } from "./message-parts/reasoning";
import { normalizeTextPart } from "./message-parts/text";
import type { ParserContext } from "../parser-context";
import { providersInOrder } from "../utils/providers";

const rawToolCallKeys = new WeakMap<object, string>();

/**
 * Part dispatch. Typed parts are claimed exclusively by one handler; a
 * message may still contain parts from several provider dialects. Shared
 * type names are handled once here, while provider-specific names are looked
 * up in the convention registry.
 */

// `image` and `file` are contested type names: Anthropic/AI-SDK and
// OpenAI/AI-SDK register guarded handlers for them in their own conventions;
// a handler returning `unmatched` falls through to the next provider.
const SHARED_TYPED_PART_HANDLERS: Readonly<Record<string, PartHandler>> = {
  text: (value) => claimed(normalizeTextPart(value)),
  input_text: (value) => claimed(normalizeTextPart(value)),
  output_text: (value) => claimed(normalizeTextPart(value)),
  reasoning: (value) => claimed(normalizeReasoningTextPart(value)),
};

function createPartContext(parserContext?: ParserContext): PartHandlerContext {
  return {
    normalizePart: (value) => normalizePart(value, parserContext),
    normalizePartList: (values) => normalizePartList(values, parserContext),
  };
}

/** Value-array -> parts mapper handed to providers as `context.normalizePartList`. */
export function normalizePartList(
  values: unknown[],
  parserContext?: ParserContext,
): NormalizedMessagePart[] {
  const parts: NormalizedMessagePart[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      parts.push(...normalizeMediaPartsFromString(value));
      continue;
    }

    const part = normalizePart(value, parserContext);
    if (!part) continue;

    // Text parts frequently embed media reference tokens mid-string; split
    // them out. Refusals and annotated text stay intact.
    if (part.type === "text" && !part.providerMetadata && !part.refusal) {
      parts.push(...normalizeMediaPartsFromString(part.text));
      continue;
    }
    parts.push(part);
  }
  return parts;
}

function normalizePartBase(
  value: unknown,
  parserContext?: ParserContext,
): NormalizedMessagePart | null {
  if (typeof value === "string") {
    const mediaReference = parseMediaReference(value);
    if (mediaReference) return filePartFromMediaReference(mediaReference);
    return { type: "text", text: value };
  }
  if (!isRecord(value)) return null;

  const partContext = createPartContext(parserContext);
  const providers = providersInOrder(parserContext?.preferredProvider);

  const type = typeof value.type === "string" ? value.type : undefined;
  if (type) {
    const sharedHandler = ownLookup(SHARED_TYPED_PART_HANDLERS, type);
    if (sharedHandler) {
      const result = sharedHandler(value, partContext);
      if (result.matched) return result.value;
    }

    for (const provider of providers) {
      const handler = ownLookup(provider.typedParts, type);
      if (!handler) continue;
      const result = handler(value, partContext);
      if (result.matched) return result.value;
    }
  } else {
    for (const provider of providers) {
      const result = provider.tryNormalizeUntypedPart?.(value, partContext);
      if (result?.matched) return result.value;
    }
  }

  return normalizeFallbackPart(value);
}

const COMMON_CONSUMED_PART_KEYS = [
  "type",
  "providerMetadata",
  "providerOptions",
] as const;

const CONSUMED_PART_KEYS_BY_TYPE: Record<
  NormalizedMessagePart["type"],
  ReadonlySet<string>
> = {
  text: new Set([
    ...COMMON_CONSUMED_PART_KEYS,
    "text",
    "content",
    "thought",
    "thoughtSignature",
    "thought_signature",
    "refusal",
    "citations",
    "annotations",
  ]),
  reasoning: new Set([
    ...COMMON_CONSUMED_PART_KEYS,
    "text",
    "content",
    "thinking",
    "signature",
    "data",
    "encrypted_content",
    "summary",
    "thought",
    "thoughtSignature",
    "thought_signature",
  ]),
  "tool-call": new Set([
    ...COMMON_CONSUMED_PART_KEYS,
    "id",
    "call_id",
    "toolCallId",
    "name",
    "toolName",
    "input",
    "arguments",
    "args",
    "function",
    "function_call",
    "functionCall",
    "custom",
    "executable_code",
    "executableCode",
    "providerExecuted",
  ]),
  "tool-result": new Set([
    ...COMMON_CONSUMED_PART_KEYS,
    "id",
    "call_id",
    "toolCallId",
    "tool_use_id",
    "name",
    "toolName",
    "tool_name",
    "output",
    "response",
    "result",
    "content",
    "value",
    "error",
    "is_error",
    "isError",
    "function_response",
    "functionResponse",
    "code_execution_result",
    "codeExecutionResult",
  ]),
  file: new Set([
    ...COMMON_CONSUMED_PART_KEYS,
    "image",
    "data",
    "url",
    "mediaType",
    "mimeType",
    "mime_type",
    "filename",
    "file",
    "file_id",
    "file_data",
    "file_url",
    "image_url",
    "input_image",
    "input_audio",
    "inline_data",
    "inlineData",
    "fileData",
    "source",
    "format",
  ]),
  // These fallback parts already preserve the complete raw value. Inferring a
  // remainder would duplicate it, but explicit providerOptions/metadata still
  // merge below for consistency with recognized parts.
  data: new Set(),
  custom: new Set(),
};

/**
 * Known part fields normalize into the canonical union; every unconsumed raw
 * field becomes providerMetadata. AI SDK providerOptions and explicit/parser-
 * computed metadata win over the inferred remainder.
 */
function withProviderMetadata<T extends NormalizedMessagePart>(
  part: T,
  value: Record<string, unknown>,
): T {
  const providerOptions = asRecord(value.providerOptions);
  const explicitProviderMetadata = asRecord(value.providerMetadata);
  const explicitMetadata = {
    ...providerOptions,
    ...explicitProviderMetadata,
    ...part.providerMetadata,
  };
  const inferRemainder = part.type !== "data" && part.type !== "custom";
  const consumedKeys = new Set(CONSUMED_PART_KEYS_BY_TYPE[part.type]);

  // Provider-executed built-ins commonly turn every remaining raw payload
  // field (action, queries, code, results, ...) into their canonical input.
  // Exclude those dynamic keys so the same payload is not duplicated in
  // providerMetadata.
  if (
    part.type === "tool-call" &&
    part.providerExecuted === true &&
    isRecord(part.input)
  ) {
    for (const key of Object.keys(part.input)) consumedKeys.add(key);
  }

  const providerMetadata = remainingProviderMetadata(
    inferRemainder ? [value] : [],
    consumedKeys,
    explicitMetadata,
  );

  return providerMetadata ? ({ ...part, providerMetadata } as T) : part;
}

export function normalizePart(
  value: unknown,
  parserContext?: ParserContext,
): NormalizedMessagePart | null {
  const part = normalizePartBase(value, parserContext);
  if (!part) return null;
  const record = asRecord(value);
  const normalized = record ? withProviderMetadata(part, record) : part;

  if (normalized.type === "tool-call") {
    rawToolCallKeys.set(normalized, getRawToolCallKey(value, normalized));
  }

  return normalized;
}

/**
 * Preserve the legacy ingestion identity for idless calls while the raw
 * arguments are still available. The key is kept outside the public part
 * shape so client-safe consumers never see ingestion-only compatibility data.
 */
export function getToolCallKeyForPart(
  part: NormalizedMessagePart,
): string | undefined {
  return part.type === "tool-call" ? rawToolCallKeys.get(part) : undefined;
}

function getRawToolCallKey(
  value: unknown,
  part: Extract<NormalizedMessagePart, { type: "tool-call" }>,
): string {
  if (part.toolCallId) return `id:${part.toolCallId}`;

  const record = asRecord(value);
  const functionCall =
    asRecord(record?.function) ??
    asRecord(record?.functionCall) ??
    asRecord(record?.function_call);
  const rawArguments =
    functionCall?.arguments ??
    functionCall?.args ??
    functionCall?.input ??
    record?.arguments ??
    record?.args ??
    record?.input;
  let argumentsValue: string;
  if (typeof rawArguments === "string") {
    argumentsValue = rawArguments;
  } else {
    try {
      argumentsValue = JSON.stringify(rawArguments ?? {});
    } catch {
      argumentsValue = JSON.stringify(part.input);
    }
  }

  return `value:${part.toolName}:${argumentsValue}`;
}
