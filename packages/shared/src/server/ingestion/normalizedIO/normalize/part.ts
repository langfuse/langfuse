import { claimed, registeredProviders } from "../conventions";
import type {
  PartHandler,
  PartHandlerContext,
} from "../conventions/IOConvention";
import type { NormalizedMessagePart } from "../types";
import { asRecord, isRecord, toProviderMetadata } from "../utils/json";
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

export function normalizePart(value: unknown): NormalizedMessagePart | null {
  const part = normalizePartBase(value);
  if (!part) return null;
  const record = asRecord(value);
  if (!record) return part;
  return withProviderOptions(part, record);
}
