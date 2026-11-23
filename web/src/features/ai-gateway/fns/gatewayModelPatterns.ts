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

/** Whether a pattern excludes models instead of including them. */
export function isGatewayModelExcludePattern(pattern: string) {
  return pattern.startsWith(EXCLUDE_PREFIX);
}

/** A sentence describing what a pattern does, e.g. "Exclude all models from the openai connection". */
export function describeGatewayModelPattern(pattern: string) {
  const isExclude = isGatewayModelExcludePattern(pattern);
  const verb = isExclude ? "Exclude" : "Include";
  const term = isExclude ? pattern.slice(EXCLUDE_PREFIX.length) : pattern;
  return `${verb} ${describeGatewayModelPatternTerm(term)}`;
}

function describeGatewayModelPatternTerm(term: string) {
  if (term === "*") return "all models";
  const separator = term.indexOf(":");
  if (separator === -1) return `models matching ${term} from any connection`;
  const connection = term.slice(0, separator);
  const model = term.slice(separator + 1);
  if (connection.includes("*")) return `models matching ${term}`;
  const source = `from the ${connection} connection`;
  if (model === "*") return `all models ${source}`;
  if (model.includes("*")) return `models matching ${model} ${source}`;
  return `${model} ${source}`;
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
    (pattern) => !isGatewayModelExcludePattern(pattern),
  );
  const excludes = lowerCasePatterns
    .filter(isGatewayModelExcludePattern)
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
