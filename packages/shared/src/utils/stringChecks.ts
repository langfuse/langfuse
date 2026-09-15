export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[\p{L}\p{N}_]+$/u;

  return charOrUnderscore.test(value);
}

// Regex for valid variable names (unicode letters, underscores, starting with letter)
export const VARIABLE_REGEX = /^\p{L}[\p{L}\p{N}_]*$/u;

// Regex to find variables in mustache syntax. Extra surrounding braces are
// treated as literals by SDK/compiler behavior, e.g. {{{name}}} -> {value}.
export const MUSTACHE_REGEX = /{{([^{}]*)}}/g;

// Regex to find multiline variables
export const MULTILINE_VARIABLE_REGEX = /{{[^{}\n]*\n[^{}]*}}/g;

// Regex to find unclosed variables
export const UNCLOSED_VARIABLE_REGEX = /{{(?!{)(?![^{]*}})/g;

// Smithy host-label check used by S3-compatible clients. AWS, GCS XML/S3,
// Cloudflare R2, MinIO, Azure location IDs (eastus), and OCI region ids all
// fit this pattern. Spaces, underscores, and GCP dual-region `+` syntax are
// rejected because they throw inside the AWS SDK and can terminate the process.
export const BLOB_STORAGE_REGION_REGEX = /^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$/;

export const BLOB_STORAGE_REGION_INVALID_MESSAGE =
  "Region must be 1-63 letters, numbers, or hyphens, and cannot start or end with a hyphen";

export function normalizeBlobStorageRegion(region: string): string {
  const normalizedRegion = region.trim();
  if (!BLOB_STORAGE_REGION_REGEX.test(normalizedRegion)) {
    throw new Error(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  }
  return normalizedRegion;
}

export function isValidVariableName(variable: string): boolean {
  return VARIABLE_REGEX.test(variable);
}

export function extractVariables(mustacheString: string): string[] {
  const matches = Array.from(mustacheString.matchAll(MUSTACHE_REGEX))
    .map((match) => match[1])
    .filter(isValidVariableName);

  return [...new Set(matches)];
}

export function stringifyValue(value: unknown) {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return value.toString();
    case "boolean":
      return value.toString();
    default:
      return JSON.stringify(value);
  }
}

export function truncate(str: string, n = 16) {
  // '...' suffix if the string is longer than n.
  // Iterate by code point (Array.from) rather than UTF-16 code unit
  // (String.prototype.substring) so that characters outside the Basic
  // Multilingual Plane - emoji, CJK extension-B ideographs, mathematical
  // alphanumerics, etc. - are never split mid-surrogate-pair. Cutting a
  // surrogate pair in half leaves a lone surrogate that renders as the
  // Unicode replacement character (U+FFFD). See issue #16172.
  // Note: `n` counts code points, not UTF-16 code units.
  const codePoints = Array.from(str);
  if (codePoints.length > n) {
    return codePoints.slice(0, n).join("") + "...";
  }
  return str;
}
