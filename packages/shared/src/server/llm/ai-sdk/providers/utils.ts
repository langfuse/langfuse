/**
 * Trims trailing slashes without regex — connection base URLs are user
 * input, and `/\/+$/`-style patterns are flagged as polynomially
 * backtracking on adversarial strings (CodeQL js/polynomial-redos).
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/**
 * Normalizes a stored origin-style base URL into the AI SDK shape, where
 * the version segment is part of `baseURL`. Keeps an already-suffixed URL
 * unchanged.
 */
export function ensureBaseURLSuffix(
  baseURL: string | null | undefined,
  suffix: string,
): string | undefined {
  if (!baseURL) return undefined;

  const trimmed = trimTrailingSlashes(baseURL);
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`;
}

/**
 * Guard for the nested per-provider escape-hatch objects (`{ openai: {...} }`
 * etc.): only plain objects are treated as AI SDK-shaped options; arrays and
 * other values fall through to the adapter's regular key handling.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
