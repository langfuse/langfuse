/** Recognize empty payloads without parsing or normalizing their contents. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string")
    return /^(?:null|""|\{\s*\}|\[\s*\])?$/.test(value.trim());
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}
