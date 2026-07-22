import {
  LAST,
  WILDCARD,
  type PathSegment,
} from "@/src/features/evals/v2/lib/jsonPathSegments";

/**
 * Walks a sample value without following inherited properties. Wildcards use
 * the first list entry as the representative shape shown by the editor.
 */
export function resolveShapeNode(
  root: unknown,
  segments: PathSegment[],
): { found: boolean; value: unknown } {
  let node = root;
  for (const segment of segments) {
    if (Array.isArray(node) && segment === WILDCARD) {
      if (node.length === 0) return { found: false, value: undefined };
      node = node.at(0);
    } else if (Array.isArray(node) && segment === LAST) {
      if (node.length === 0) return { found: false, value: undefined };
      node = node.at(-1);
    } else if (Array.isArray(node) && typeof segment === "number") {
      if (segment < 0 || segment >= node.length) {
        return { found: false, value: undefined };
      }
      node = node.at(segment);
    } else if (
      node !== null &&
      typeof node === "object" &&
      !Array.isArray(node) &&
      typeof segment === "string"
    ) {
      const property = Object.getOwnPropertyDescriptor(node, segment);
      if (!property || !("value" in property)) {
        return { found: false, value: undefined };
      }
      node = property.value;
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: node };
}
