import { claimed, unmatched } from "../../io-convention";
import { normalizeMediaPartsFromString } from "../../../core/normalize/message-parts/media";
import { reasoningPart } from "../../../core/normalize/message-parts/reasoning";
import { asRecord } from "../../../core/utils/json";
import type { NormalizedMessage } from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
} from "../../io-convention";

/**
 * OpenRouter Broadcast traces store the model reply in one envelope: the
 * completion text, its reasoning, the emitted tool calls, and the originating
 * request under `rawRequest`. Claiming the envelope keeps the reply as a
 * message with its text, reasoning, and tool calls intact.
 */
const unwrapOpenRouterCompletion = (
  value: Record<string, unknown>,
  fallbackRole: "user" | "assistant",
  ctx: MessageEnvelopeContext,
): ConventionResult<NormalizedMessage> => {
  if (typeof value.completion !== "string") return unmatched;
  if (!asRecord(value.rawRequest)) return unmatched;

  const reasoning =
    typeof value.reasoning === "string" && value.reasoning.length > 0
      ? [reasoningPart(value.reasoning)]
      : [];
  const content = normalizeMediaPartsFromString(value.completion);
  const toolCalls = Array.isArray(value.toolCalls)
    ? ctx.normalizePartList(value.toolCalls)
    : [];
  const parts = [...reasoning, ...content, ...toolCalls];
  if (parts.length === 0) return claimed(null);

  return claimed({ role: fallbackRole, parts, source: ctx.source });
};

export const openRouterProvider = {
  name: "openrouter",
  tryUnwrapMessage: unwrapOpenRouterCompletion,
} satisfies IOConvention;
