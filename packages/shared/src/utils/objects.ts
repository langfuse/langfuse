type OmitKeys<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Removes specified keys from an object and returns a new object without those keys.
 */
export function removeObjectKeys<T, K extends keyof T>(
  obj: T,
  keys: K[],
): OmitKeys<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Safely coerces a value to a Record if it's a plain object.
 * Returns undefined for null, undefined, arrays, and non-objects.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Safely coerces a value to a string if it's a non-empty string.
 * Returns undefined for empty strings and non-strings.
 */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Safely coerces a value to a boolean if it's a boolean.
 * Returns undefined for non-booleans.
 */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Safely coerces a value to a string array if it's an array of strings.
 * Returns undefined for non-arrays or arrays with non-string elements.
 */
export function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

/**
 * Safely coerces a value to a Record<string, number> if it's an object with numeric values.
 * Filters out non-finite numbers. Returns undefined if result is empty or input is not an object.
 */
export function asNumberRecord(
  value: unknown,
): Record<string, number> | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(record).filter(
      ([, entry]) => typeof entry === "number" && Number.isFinite(entry),
    ),
  ) as Record<string, number>;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
