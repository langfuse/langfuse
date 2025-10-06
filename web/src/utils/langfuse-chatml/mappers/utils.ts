// check if object (not array nor null)
export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export function parseMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  if (metadata && typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Extract the actual json data from ChatML message json field.
 * ChatML schema's passthrough behavior wraps extra fields in nested json object.
 * This handles both: { json: {...} } and {...}
 */
export function extractJsonData(
  msgJson: unknown,
): Record<string, unknown> | undefined {
  if (!msgJson || typeof msgJson !== "object") return undefined;

  const obj = msgJson as Record<string, unknown>;

  // if it's the nested format: { json: {...} }
  if ("json" in obj && typeof obj.json === "object" && obj.json !== null) {
    return obj.json as Record<string, unknown>;
  }

  return obj;
}
