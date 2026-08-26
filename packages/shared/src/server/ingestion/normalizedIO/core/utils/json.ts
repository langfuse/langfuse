import type { JsonObject, JsonValue } from "../types";

/**
 * Generic JSON/string utilities shared by the parser and the convention
 * modules. No provider knowledge lives here.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
