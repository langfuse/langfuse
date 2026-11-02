import { claimed, unmatched } from "../../io-convention";
import { asRecord, parseRecord } from "../../../core/utils/json";
import type { NormalizedMessage } from "../../../types";
import type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
} from "../../io-convention";

/**
 * Semantic Kernel convention. SK logs whole messages as OTel GenAI event
 * payloads under a `gen_ai.event.content` key (a JSON string); the actual
 * message is nested under `message` or is the decoded payload itself.
 */
function unwrapSemanticKernelEnvelope(
  value: Record<string, unknown>,
  fallbackRole: "user" | "assistant",
  ctx: MessageEnvelopeContext,
): ConventionResult<NormalizedMessage> {
  const content = parseRecord(value["gen_ai.event.content"]);
  if (!content) return unmatched;

  return claimed(
    ctx.normalizeMessage(asRecord(content.message) ?? content, fallbackRole),
  );
}

export const semanticKernelProvider = {
  name: "semantic-kernel",
  tryUnwrapMessage: unwrapSemanticKernelEnvelope,
} satisfies IOConvention;
