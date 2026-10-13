import { registeredProviders } from "../../conventions";
import { FinishReason } from "../../types";
import { optionalString, ownLookup } from "../utils/json";

/**
 * Read the finish/stop carrier off a record (message, choice/candidate, or
 * envelope event) and canonicalize it: anthropic carries `stop_reason`,
 * openai/gemini carry `finish_reason`/`finishReason`, langchain nests both
 * under `response_metadata` (passed as the second carrier).
 */
export function normalizeFinishReason(
  data: Record<string, unknown>,
  responseMetadata?: Record<string, unknown>,
): FinishReason | undefined {
  const raw =
    data.stop_reason ?? // anthropic
    data.finish_reason ??
    data.finishReason ??
    responseMetadata?.finish_reason ?? // langchain
    responseMetadata?.stop_reason; // langchain

  const value = optionalString(raw);
  if (!value) return undefined;

  // Lookups are lowercased (Gemini reports uppercase values). Registry order
  // must never matter: overlapping vocabulary across providers maps to the
  // same canonical value (asserted by registry.test.ts).
  const lowered = value.toLowerCase();
  const providerType = registeredProviders
    .map((provider) => ownLookup(provider.finishReasonTypeByRaw, lowered))
    .find((type) => type !== undefined);

  return { type: providerType ?? "unknown", raw: value };
}
