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

/** Adds the comma-separated patterns typed in the models input, skipping blanks and duplicates. */
export function addGatewayModelPatterns(
  patterns: readonly string[],
  draft: string,
) {
  return [
    ...new Set([
      ...patterns,
      ...draft.split(",").flatMap((text) => {
        const pattern = toTypedGatewayModelPattern(text);
        return pattern === null ? [] : [pattern];
      }),
    ]),
  ];
}

/**
 * Whether a gateway key's model patterns allow a `connection:model` slug.
 * `*` matches any characters; a leading `-` excludes. Matching ignores case.
 * Without include patterns, every model not excluded is allowed. Null allows
 * every model.
 */
export function matchesGatewayModelPatterns(
  patterns: readonly string[] | null,
  modelSlug: string,
) {
  if (patterns === null) return true;
  const slug = modelSlug.toLowerCase();
  const lowerCasePatterns = patterns.map((pattern) => pattern.toLowerCase());
  const includes = lowerCasePatterns.filter(
    (pattern) => !pattern.startsWith(EXCLUDE_PREFIX),
  );
  const excludes = lowerCasePatterns
    .filter((pattern) => pattern.startsWith(EXCLUDE_PREFIX))
    .map((pattern) => pattern.slice(EXCLUDE_PREFIX.length));
  const isIncluded =
    includes.length === 0 ||
    includes.some((pattern) => matchesGlob(pattern, slug));
  return isIncluded && !excludes.some((pattern) => matchesGlob(pattern, slug));
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
