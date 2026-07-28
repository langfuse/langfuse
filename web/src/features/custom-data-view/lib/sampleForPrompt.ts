// LFE-14544 demo spike — shrink an observation object into a JSON sample the
// model can read for SHAPE (it renders against the full data client-side, so
// values only need to be representative, not complete).

const MAX_STRING = 400;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 7;
const MAX_TOTAL_CHARS = 14000;

function shrink(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]`
      : value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[array of ${value.length}]`;
    const capped: unknown[] = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => shrink(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      capped.push(`…[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }
    return capped;
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value) || depth >= MAX_DEPTH) return "…";
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>);
    const capped = Object.fromEntries(
      entries
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, item]) => [key, shrink(item, depth + 1, seen)]),
    );
    if (entries.length > MAX_OBJECT_KEYS) {
      capped["…"] = `+${entries.length - MAX_OBJECT_KEYS} more keys`;
    }
    return capped;
  }
  return value;
}

export function sampleForPrompt(value: unknown): string {
  const json = JSON.stringify(shrink(value, 0, new WeakSet()), null, 1);
  if (!json) return "null";
  return json.length > MAX_TOTAL_CHARS
    ? `${json.slice(0, MAX_TOTAL_CHARS)}\n…[sample truncated]`
    : json;
}
