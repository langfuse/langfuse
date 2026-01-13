/**
 * Safely gets a number value from a Map or Record object, returning undefined if the key doesn't exist.
 * Supports both Map and plain object (Record) types for backward compatibility.
 */
export function getNumberFromMap(
  mapOrRecord: Map<any, any> | Record<string, number> | undefined,
  key: any,
): number | undefined {
  if (!mapOrRecord) return undefined;
  if (mapOrRecord instanceof Map) {
    return mapOrRecord.get(key) as number | undefined;
  }
  return mapOrRecord[key];
}

/**
 * Type-casts a Map or Record with unknown generic types to the appropriate number type.
 * Useful to handle Maps/Records returned from tRPC queries where TypeScript
 * can't properly infer the generic types.
 */
export function castToNumberMap(
  mapOrRecord: Map<unknown, unknown> | Record<string, unknown> | undefined,
): Map<string, number> | undefined {
  if (!mapOrRecord) return undefined;
  if (mapOrRecord instanceof Map) {
    return mapOrRecord as Map<string, number>;
  }
  return new Map(
    Object.entries(mapOrRecord).map(([key, value]) => [key, Number(value)]),
  );
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
