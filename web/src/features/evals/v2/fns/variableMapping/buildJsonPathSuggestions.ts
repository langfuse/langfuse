import {
  WILDCARD,
  segmentsToJsonPath,
  type PathSegment,
} from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";

const MAX_PATHS = 200;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 3;
const MAX_OBJECT_KEYS = 25;

/**
 * Builds JSONPath suggestions (e.g. `$.messages[0].content`) by walking a
 * sample value — the LangSmith-style "map from example" list. The value must
 * already be decoded.
 */
export function buildJsonPathSuggestions(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];

  const paths: string[] = [];
  const push = (segments: PathSegment[]) => {
    const path = segmentsToJsonPath(segments);
    if (path) paths.push(path);
  };

  const walk = (node: unknown, segments: PathSegment[], depth: number) => {
    if (paths.length >= MAX_PATHS || depth > MAX_DEPTH) return;

    if (Array.isArray(node)) {
      const shown = Math.min(node.length, MAX_ARRAY_ITEMS);
      for (let index = 0; index < shown; index++) {
        const childSegments = [...segments, index];
        push(childSegments);
        walk(node[index], childSegments, depth + 1);
      }
      if (node.length > 0) push([...segments, WILDCARD]);
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node).slice(0, MAX_OBJECT_KEYS)) {
        const childSegments = [...segments, key];
        push(childSegments);
        walk((node as Record<string, unknown>)[key], childSegments, depth + 1);
      }
    }
  };

  walk(value, [], 1);
  return paths;
}
