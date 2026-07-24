const MAX_PATHS = 200;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 3;
const MAX_OBJECT_KEYS = 25;

const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Observation payloads are often stored as (multi-)encoded JSON strings — unwrap
// until we hit a non-string, mirroring extractValueFromObject's behavior.
export function tryParseJson(value: string): unknown {
  let current: unknown = value;
  for (let i = 0; i < 3 && typeof current === "string"; i++) {
    try {
      current = JSON.parse(current);
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * Builds JSONPath suggestions (e.g. `$.messages[0].content`) by walking a
 * sample value — the LangSmith-style "map from example" list.
 */
export function buildJsonPathSuggestions(value: unknown): string[] {
  const root = typeof value === "string" ? tryParseJson(value) : value;
  if (root === null || typeof root !== "object") return [];

  const paths: string[] = [];

  const walk = (node: unknown, path: string, depth: number) => {
    if (paths.length >= MAX_PATHS || depth > MAX_DEPTH) return;

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, MAX_ARRAY_ITEMS); i++) {
        const childPath = `${path}[${i}]`;
        paths.push(childPath);
        walk(node[i], childPath, depth + 1);
      }
      if (node.length > 0) {
        paths.push(`${path}[*]`);
      }
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node).slice(0, MAX_OBJECT_KEYS)) {
        const childPath = IDENTIFIER_REGEX.test(key)
          ? `${path}.${key}`
          : `${path}["${key}"]`;
        paths.push(childPath);
        walk((node as Record<string, unknown>)[key], childPath, depth + 1);
      }
    }
  };

  walk(root, "$", 1);
  return paths;
}
