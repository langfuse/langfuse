/** Filter column for keys of the SKILL.md frontmatter stored on each skill version. */
export const FRONTMATTER_FILTER_COLUMN = "frontmatter";

// Already exposed as dedicated columns and free-text search.
const EXCLUDED_TOP_LEVEL_KEYS = new Set(["name", "description"]);
const MAX_VALUES_PER_KEY = 50;
const MAX_VALUE_LENGTH = 200;

/** Nested frontmatter keys are addressed with dots: `metadata.author`. */
export function frontmatterKeyPath(key: string): string[] {
  return key.split(".");
}

/**
 * Collects every frontmatter key path across the given skills, with the
 * distinct scalar values seen for it. Arrays, nulls and long strings list the
 * key without value suggestions.
 */
export function listFrontmatterValues(
  frontmatters: unknown[],
): Record<string, string[]> {
  const valuesByKey = new Map<string, Set<string>>();

  const visit = (value: unknown, path: string[]) => {
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (path.length === 0 && EXCLUDED_TOP_LEVEL_KEYS.has(key)) continue;
        visit(child, [...path, key]);
      }
      return;
    }
    if (path.length === 0) return;
    const key = path.join(".");
    const values = valuesByKey.get(key) ?? new Set<string>();
    valuesByKey.set(key, values);
    if (
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") &&
      String(value).length <= MAX_VALUE_LENGTH &&
      values.size < MAX_VALUES_PER_KEY
    ) {
      values.add(String(value));
    }
  };

  for (const frontmatter of frontmatters) visit(frontmatter, []);

  return Object.fromEntries(
    [...valuesByKey]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [
        key,
        [...values].sort((a, b) => a.localeCompare(b)),
      ]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
