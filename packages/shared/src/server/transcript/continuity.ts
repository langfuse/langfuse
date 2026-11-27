import type { PreparedMessage } from "./messages";

/** System instructions and enrichment alone cannot establish continuity. */
export function contributesToContinuity(message: PreparedMessage) {
  return message.role !== "system" && message.identityKey !== undefined;
}
