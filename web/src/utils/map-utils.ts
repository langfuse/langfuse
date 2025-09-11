/**
 * Safely gets a number value from a Map, returning undefined if the key doesn't exist.
 * Specifically typed for Maps that return numbers.
 */
export function getNumberFromMap(
  map: Map<any, any> | undefined,
  key: any,
): number | undefined {
  return map?.get(key) as number | undefined;
}

/**
 * Type-casts a Map with unknown generic types to a Map<string, number>.
 * Useful to handle Maps returned from tRPC queries where TypeScript
 * can't properly infer the generic types.
 */
export function castToNumberMap(
  map: Map<unknown, unknown> | undefined,
): Map<string, number> | undefined {
  return map as Map<string, number> | undefined;
}

/**
 * Safely extracts a property from potentially undefined data (e.g. tRPC query responses),
 * returning a default value if not found.
 */
export function safeExtract<T, K extends keyof T, R>(
  data: T | undefined | null,
  key: K,
  defaultValue: R = [] as R,
): T[K] | R {
  return data?.[key] ?? defaultValue;
}
