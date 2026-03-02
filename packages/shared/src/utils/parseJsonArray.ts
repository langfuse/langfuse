/**
 * Client-safe parseJsonArray (no server/env deps).
 * Use this from client components; server code can use the one from utils/oceanbase.
 */
export function parseJsonArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }

  return [];
}
