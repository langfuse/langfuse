export function previewOf(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

export function typeBadge(value: unknown) {
  if (Array.isArray(value)) return `list · ${value.length}`;
  if (value === null) return "null";
  if (typeof value === "object") return `object · ${Object.keys(value).length}`;
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}
