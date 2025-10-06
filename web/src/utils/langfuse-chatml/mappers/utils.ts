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
