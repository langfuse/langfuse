function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRole(value: unknown): boolean {
  return isRecord(value) && typeof value.role === "string";
}

/**
 * Whether one observation side (decoded input or output) is chat: an array
 * of messages, bare or wrapped as `{ messages: [...] }`, or a single message,
 * where at least one entry declares a string `role`. Anything else is
 * non-chat I/O that the preview wraps into messages itself.
 */
export function isChatMessageIO(value: unknown): boolean {
  const messages = isRecord(value) ? value.messages : value;
  if (Array.isArray(messages)) return messages.some(hasRole);
  return hasRole(value);
}
