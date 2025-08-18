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
 * This is useful for handling Maps returned from tRPC queries where TypeScript
 * can't properly infer the generic types.
 */
export function castToNumberMap(
  map: Map<unknown, unknown> | undefined,
): Map<string, number> | undefined {
  return map as Map<string, number> | undefined;
}
