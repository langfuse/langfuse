import { registeredProviders } from "../../conventions";
import type { NormalizedMessagePart, NormalizedMessageRole } from "../../types";
import { ownLookup } from "../utils/json";
const CANONICAL_ROLES = new Set(["system", "user", "assistant", "tool"]);

export function normalizeRole(
  message: Record<string, unknown>,
): NormalizedMessageRole | undefined {
  const rawRole = message.role ?? message.author; // author: gemini/PaLM-era
  if (typeof rawRole === "string") {
    const lowered = rawRole.toLowerCase();
    for (const provider of registeredProviders) {
      const role = ownLookup(provider.roleByRawRole, lowered);
      if (role) return role;
    }
    if (CANONICAL_ROLES.has(lowered)) return lowered as NormalizedMessageRole;
    // Unrecognized strings are identities, not roles (e.g. LangGraph agent
    // names): the caller falls back to the contextual role and preserves the
    // raw string as `senderName`.
    return undefined;
  }

  if (typeof message.type !== "string") return undefined;
  for (const provider of registeredProviders) {
    const role = ownLookup(provider.roleByMessageType, message.type);
    if (role) return role;
  }
  return undefined;
}

/**
 * Role corrections that depend on the collected parts: user turns holding
 * only tool results are tool turns; tool-labeled turns without a
 * tool_call_id (koog/Traceloop-style conversions) are either mislabeled
 * assistant call batches or tool responses (the content IS the result).
 */
export function coerceRole(
  role: NormalizedMessageRole,
  value: Record<string, unknown>,
  parts: NormalizedMessagePart[],
): NormalizedMessageRole {
  if (
    role === "user" &&
    parts.length > 0 &&
    parts.every((part) => part.type === "tool-result")
  ) {
    return "tool";
  }

  if (role === "tool" && !value.tool_call_id && parts.length > 0) {
    // Explicit boolean return type: TS would otherwise infer a type
    // predicate and narrow `parts` to TextPart[], rejecting the splice.
    if (parts.every((part): boolean => part.type === "tool-call")) {
      return "assistant";
    }
    if (parts.every((part): boolean => part.type === "text")) {
      const output = parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n");
      parts.splice(0, parts.length, {
        type: "tool-result",
        toolCallId: null,
        output,
      });
    }
  }

  return role;
}
