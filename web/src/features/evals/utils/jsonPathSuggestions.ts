// Utility to generate JSONPath suggestions from a sample value

type SuggestionOptions = {
  maxDepth?: number;
  maxPaths?: number;
  includeIntermediate?: boolean;
  // Max number of elements to sample per array when inferring nested keys
  arraySampleSize?: number;
};

function tryParseJsonDeep(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let current: unknown = value;
  const maxIterations = 3;
  for (let i = 0; i < maxIterations; i++) {
    if (typeof current !== "string") return current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(current);
      current = parsed;
    } catch {
      return current;
    }
  }
  return current;
}

function isIdentifierKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function escapeForBracketNotation(key: string): string {
  return key.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function appendKey(path: string, key: string): string {
  if (isIdentifierKey(key)) return `${path}.${key}`;
  return `${path}['${escapeForBracketNotation(key)}']`;
}

export function extractJsonPathSuggestions(
  rawValue: unknown,
  options: SuggestionOptions = {},
): string[] {
  const maxDepth = options.maxDepth ?? 5;
  const maxPaths = options.maxPaths ?? 150;
  const includeIntermediate = options.includeIntermediate ?? true;
  const arraySampleSize = options.arraySampleSize ?? 10;

  const value = tryParseJsonDeep(rawValue);

  if (value === null || value === undefined) return [];

  const suggestions = new Set<string>();
  const visited = new WeakSet<object>();

  type Node = { v: unknown; p: string; d: number };
  const queue: Node[] = [{ v: value, p: "$", d: 0 }];

  while (queue.length > 0 && suggestions.size < maxPaths) {
    const { v, p, d } = queue.shift() as Node;

    if (d >= maxDepth) continue;

    if (Array.isArray(v)) {
      const arrayPath = `${p}[*]`;
      if (includeIntermediate) suggestions.add(arrayPath);

      if (v.length > 0) {
        const sampleCount = Math.min(v.length, arraySampleSize);
        for (let i = 0; i < sampleCount; i++) {
          queue.push({ v: v[i], p: arrayPath, d: d + 1 });
        }
      }
      continue;
    }

    if (typeof v === "object" && v !== null) {
      if (visited.has(v)) continue;
      visited.add(v);

      const entries = Object.entries(v as Record<string, unknown>);
      for (const [key, val] of entries) {
        const nextPath = appendKey(p, key);
        if (includeIntermediate) suggestions.add(nextPath);

        if (
          val !== null &&
          (typeof val === "object" ||
            (typeof val === "string" && val.trim().startsWith("{")) ||
            (typeof val === "string" && val.trim().startsWith("[")))
        ) {
          // attempt to parse nested string JSON lazily
          const parsed = tryParseJsonDeep(val);
          queue.push({ v: parsed, p: nextPath, d: d + 1 });
        }
      }
      continue;
    }
  }

  return Array.from(suggestions).slice(0, maxPaths);
}
