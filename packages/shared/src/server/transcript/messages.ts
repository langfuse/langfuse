import { partition } from "lodash";
import type { NormalizedMessage } from "../../utils/normalized-io";
import { messageKey } from "./comparison";

export type MessageKeys = {
  /** Identifies parts used to establish continuity and detect replay. */
  identityKey?: string;
  /** Identifies additional parts preserved and deduplicated independently. */
  enrichmentKey?: string;
};

export type PreparedMessage = NormalizedMessage & MessageKeys;

export function prepareMessage(message: NormalizedMessage): PreparedMessage {
  const [enrichmentParts, identityParts] = partition(
    message.parts,
    isEnrichmentPart,
  );
  return {
    ...message,
    identityKey:
      identityParts.length > 0
        ? messageKey({ ...message, parts: identityParts })
        : undefined,
    enrichmentKey:
      enrichmentParts.length > 0
        ? messageKey({ ...message, parts: enrichmentParts })
        : undefined,
  };
}

export const isEnrichmentPart = (part: NormalizedMessage["parts"][number]) =>
  part.type === "reasoning" ||
  (part.type === "file" && part.reasoning === true);
