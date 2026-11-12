const EXCLUDE_PREFIX = "-";

/**
 * Whether a gateway key's model patterns allow a `connection:model` slug.
 * `*` matches any characters; a leading `-` excludes. Without include
 * patterns, every model not excluded is allowed. Null allows every model.
 */
export function matchesGatewayModelPatterns(
  patterns: readonly string[] | null,
  modelSlug: string,
) {
  if (patterns === null) return true;
  const includes = patterns.filter(
    (pattern) => !pattern.startsWith(EXCLUDE_PREFIX),
  );
  const excludes = patterns
    .filter((pattern) => pattern.startsWith(EXCLUDE_PREFIX))
    .map((pattern) => pattern.slice(EXCLUDE_PREFIX.length));
  const isIncluded =
    includes.length === 0 ||
    includes.some((pattern) => matchesGlob(pattern, modelSlug));
  return (
    isIncluded && !excludes.some((pattern) => matchesGlob(pattern, modelSlug))
  );
}

function matchesGlob(pattern: string, value: string) {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === value;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  if (
    value.length < first.length + last.length ||
    !value.startsWith(first) ||
    !value.endsWith(last)
  ) {
    return false;
  }
  let position = first.length;
  const end = value.length - last.length;
  for (const part of parts.slice(1, -1)) {
    const index = value.indexOf(part, position);
    if (index === -1 || index + part.length > end) return false;
    position = index + part.length;
  }
  return true;
}
