const MAX_PREVIEW_LENGTH = 700;
const MAX_PREVIEW_CHILDREN = 10;
const MAX_PREVIEW_DEPTH = 3;
const MAX_OBJECT_ROWS = 50;

function structuredPreview(value: unknown, depth: number): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return JSON.stringify(value.slice(0, MAX_PREVIEW_LENGTH));
    }
    return JSON.stringify(value) ?? String(value);
  }
  if (depth >= MAX_PREVIEW_DEPTH) return Array.isArray(value) ? "[…]" : "{…}";

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_PREVIEW_CHILDREN)
      .map((item) => structuredPreview(item, depth + 1));
    if (value.length > MAX_PREVIEW_CHILDREN) items.push("…");
    return `[${items.join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const fields = keys
    .slice(0, MAX_PREVIEW_CHILDREN)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${structuredPreview(record[key], depth + 1)}`,
    );
  if (keys.length > MAX_PREVIEW_CHILDREN) fields.push("…");
  return `{${fields.join(",")}}`;
}

export function previewOf(value: unknown) {
  if (value === undefined) return "No sample value available";
  if (typeof value === "string") {
    return value.length > MAX_PREVIEW_LENGTH
      ? `${value.slice(0, MAX_PREVIEW_LENGTH)}…`
      : value;
  }
  const preview = structuredPreview(value, 0);
  return preview.length > MAX_PREVIEW_LENGTH
    ? `${preview.slice(0, MAX_PREVIEW_LENGTH)}…`
    : preview;
}

export function objectEntriesForPreview(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  return {
    entries: keys
      .slice(0, MAX_OBJECT_ROWS)
      .map((key): [string, unknown] => [key, value[key]]),
    remaining: Math.max(0, keys.length - MAX_OBJECT_ROWS),
  };
}

export function typeBadge(value: unknown) {
  if (value === undefined) return "no value";
  if (Array.isArray(value)) return `list · ${value.length}`;
  if (value === null) return "null";
  if (typeof value === "object") return `object · ${Object.keys(value).length}`;
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}
