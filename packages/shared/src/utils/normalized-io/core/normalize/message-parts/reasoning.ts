import type { NormalizedMessagePart, ReasoningPart } from "../../../types";
import { compact, toJsonValue } from "../../utils/json";

/** String payloads become visible reasoning text; everything else is data. */
export function reasoningPart(
  payload: unknown,
  signature?: string,
): ReasoningPart {
  return {
    type: "reasoning",
    content:
      typeof payload === "string"
        ? compact({ kind: "text" as const, text: payload, signature })
        : { kind: "data", value: toJsonValue(payload) },
  };
}

/** Universal reasoning-text block: `reasoning`/`reasoning_text`/`summary_text`
 * all carry their payload under one of text/content/thinking/summary. */
export function normalizeReasoningTextPart(
  value: Record<string, unknown>,
): NormalizedMessagePart {
  const reasoning =
    value.text ?? value.content ?? value.thinking ?? value.summary;
  return reasoningPart(reasoning);
}
