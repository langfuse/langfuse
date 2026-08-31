import type { JsonObject, JsonValue } from "../../types";

/**
 * Generic JSON/string utilities shared by the parser and the convention
 * modules. No provider knowledge lives here.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Own-property lookup for input-derived keys: `__proto__`/`constructor` must
 * miss (taking the caller's unknown-value fallback), not resolve through the
 * prototype chain to non-handler values.
 */
export function ownLookup<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key)
    ? record[key]
    : undefined;
}

export function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toJsonValue(nestedValue),
      ]),
    );
  }

  // Telemetry values should already be JSON-compatible. Preserve an explicit
  // fallback instead of dropping an unexpected value from the custom part.
  return value === undefined ? null : String(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Parse one JSON-string boundary. Nested values are parsed only by their owner. */
export function parseIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function parseRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return asRecord(parseIfString(value));
}

export function parseArray(value: unknown): unknown[] | undefined {
  const parsed = parseIfString(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

export function toProviderMetadata(
  entries: Record<string, unknown>,
): JsonObject | undefined {
  const value = toJsonValue(entries);
  return isRecord(value) && Object.keys(value).length > 0 ? value : undefined;
}

/**
 * Preserve the fields a normalizer did not consume. Records are folded in
 * order and explicit metadata wins last, matching object-spread semantics
 * without requiring every provider handler to rebuild the same remainder.
 */
export function remainingProviderMetadata(
  records: readonly Record<string, unknown>[],
  consumedKeys: ReadonlySet<string>,
  explicitMetadata?: Record<string, unknown>,
): JsonObject | undefined {
  const remaining: Record<string, unknown> = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!consumedKeys.has(key)) remaining[key] = value;
    }
  }

  if (explicitMetadata) {
    for (const [key, value] of Object.entries(explicitMetadata)) {
      remaining[key] = value;
    }
  }

  return toProviderMetadata(remaining);
}

/** Strip undefined-valued keys so optional fields are absent, not undefined. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as T;
}

export function omitKeys(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}
