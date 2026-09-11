import { registeredProviders } from "../../../conventions";
import type { JsonValue, NormalizedMessagePart } from "../../../types";
import { optionalString, parseArray, toJsonValue } from "../../utils/json";
import { reasoningPart } from "./reasoning";

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
export function normalizeTextPart(
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
