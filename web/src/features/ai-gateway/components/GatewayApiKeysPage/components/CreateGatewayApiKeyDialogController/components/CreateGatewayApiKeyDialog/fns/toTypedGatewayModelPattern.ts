const EXCLUDE_PREFIX = "-";

/**
 * The pattern for typed text: wrapped in `*` unless it already names a
 * connection or uses a wildcard, keeping a leading `-`. Null for blank text.
 */
export function toTypedGatewayModelPattern(text: string) {
  const trimmed = text.trim();
  const prefix = trimmed.startsWith(EXCLUDE_PREFIX) ? EXCLUDE_PREFIX : "";
  const term = trimmed.slice(prefix.length);
  if (!term) return null;
  return term.includes("*") || term.includes(":")
    ? `${prefix}${term}`
    : `${prefix}*${term}*`;
}
