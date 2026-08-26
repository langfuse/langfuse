import { claimed, registeredProviders } from "../../conventions";
import type {
  PartHandler,
  PartHandlerContext,
} from "../../conventions/IOConvention";
import type { NormalizedMessagePart } from "../../types";
import {
  asRecord,
  isRecord,
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

/**
 * Part dispatch. Typed parts are claimed exclusively by one handler; a
 * message may still contain parts from several provider dialects. Shared
 * type names are handled once here, while provider-specific names are looked
 * up in the convention registry.
 */

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

/** Value-array -> parts mapper handed to providers as `context.normalizePartList`. */
export function normalizePartList(values: unknown[]): NormalizedMessagePart[] {
  const parts: NormalizedMessagePart[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      parts.push(...normalizeMediaPartsFromString(value));
      continue;
    }

    const part = normalizePart(value);
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

const partContext: PartHandlerContext = {
  normalizePart: normalizePart,
  normalizePartList,
};

function normalizePartBase(value: unknown): NormalizedMessagePart | null {
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
    "index",
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

export function normalizePart(value: unknown): NormalizedMessagePart | null {
  const part = normalizePartBase(value);
  if (!part) return null;
  const record = asRecord(value);
  if (!record) return part;
  return withProviderMetadata(part, record);
}
