const EXCLUDE_PREFIX = "-";

/**
 * Rewrites patterns that start with exactly `previousName:` (or `-previousName:`)
 * to the new connection name. Wildcard prefixes such as `open*:` stay as typed.
 */
export function renameGatewayModelPatternsConnection(
  patterns: readonly string[],
  previousName: string,
  name: string,
) {
  const previousPrefix = `${previousName}:`;
  return patterns.map((pattern) => {
    const sign = pattern.startsWith(EXCLUDE_PREFIX) ? EXCLUDE_PREFIX : "";
    const body = pattern.slice(sign.length);
    return body.startsWith(previousPrefix)
      ? `${sign}${name}:${body.slice(previousPrefix.length)}`
      : pattern;
  });
}
