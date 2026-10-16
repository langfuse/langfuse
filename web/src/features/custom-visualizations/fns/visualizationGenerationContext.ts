type ContextObservation = {
  id: string;
  name?: string | null;
  type?: string | null;
  level?: string | null;
  statusMessage?: string | null;
};

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const compactValue = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(ANSI_PATTERN, "");
    if (/^data:[^;]+;base64,/i.test(cleaned)) {
      return `[data URL omitted · ${cleaned.length.toLocaleString()} characters]`;
    }
    if (cleaned.length <= 1_200) return cleaned;
    return `${cleaned.slice(0, 800)}\n… ${(
      cleaned.length - 1_000
    ).toLocaleString()} characters omitted …\n${cleaned.slice(-200)}`;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular reference]";
  if (depth >= 4)
    return Array.isArray(value) ? "[nested array]" : "[nested object]";

  seen.add(value);
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 8)
      .map((item) => compactValue(item, depth + 1, seen));
    if (value.length > 8) items.push(`… ${value.length - 8} more items`);
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 24);
  const result = Object.fromEntries(
    entries.map(([key, item]) => [key, compactValue(item, depth + 1, seen)]),
  );
  const omitted = Object.keys(value).length - entries.length;
  if (omitted > 0) result["…"] = `${omitted} more fields`;
  return result;
};

export const compactContextPreview = (value: unknown, maxChars = 3_000) => {
  let serialized: string;
  try {
    serialized =
      JSON.stringify(compactValue(value, 0, new WeakSet()), null, 2) ??
      String(value ?? "");
  } catch {
    serialized = String(value ?? "");
  }
  if (serialized.length <= maxChars) return serialized;
  const tailLength = Math.min(240, Math.floor(maxChars / 5));
  const omitted = serialized.length - maxChars + tailLength + 80;
  return `${serialized.slice(0, maxChars - tailLength - 80)}\n… ${omitted.toLocaleString()} characters omitted …\n${serialized.slice(-tailLength)}`;
};

export const selectDiverseObservations = <T extends ContextObservation>(
  observations: T[],
  selectedId: string | undefined,
  limit = 6,
) => {
  const unique = Array.from(
    new Map(
      observations.map((observation) => [observation.id, observation]),
    ).values(),
  );
  const chosen: T[] = [];
  const add = (observation: T | undefined) => {
    if (!observation || chosen.some((item) => item.id === observation.id))
      return;
    if (chosen.length < limit) chosen.push(observation);
  };

  add(unique.find((observation) => observation.id === selectedId));
  add(
    unique.find(
      (observation) =>
        observation.level === "ERROR" || Boolean(observation.statusMessage),
    ),
  );

  for (const observation of unique) {
    const alreadyRepresented = chosen.some(
      (item) =>
        item.type === observation.type && item.name === observation.name,
    );
    if (!alreadyRepresented) add(observation);
  }
  unique.forEach(add);
  return chosen;
};
