/**
 * The drill-down JSONPath grammar shared between the prompt pills and the
 * mapping panel: plain keys, numeric indices, the every-entry wildcard, and
 * a dynamic last-entry selector.
 * Anything else (filters, slices, …) is treated as an opaque path.
 */

// A drill path segment: object key, array index, every entry, or the final
// entry. JSONPath-Plus expresses the latter as a one-item slice (`[-1:]`).
export const WILDCARD = Symbol("wildcard");
export const LAST = Symbol("last");
export type PathSegment = string | number | typeof WILDCARD | typeof LAST;

const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Segments → the JSONPath stored on the mapping ("$.messages[*].content"). */
export function segmentsToJsonPath(segments: PathSegment[]): string | null {
  if (segments.length === 0) return null;
  return (
    "$" +
    segments
      .map((segment) =>
        segment === WILDCARD
          ? "[*]"
          : segment === LAST
            ? "[-1:]"
            : typeof segment === "number"
              ? `[${segment}]`
              : IDENTIFIER_REGEX.test(segment)
                ? `.${segment}`
                : `[${JSON.stringify(segment)}]`,
      )
      .join("")
  );
}

/**
 * Parses the drill-down grammar back into segments. Returns null for paths
 * the panel didn't generate (filters, slices, …).
 */
export function jsonPathToSegments(path: string): PathSegment[] | null {
  if (!path.startsWith("$")) return null;
  const segments: PathSegment[] = [];
  let i = 1;
  while (i < path.length) {
    if (path[i] === ".") {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(path.slice(i + 1));
      if (!match) return null;
      segments.push(match[0]);
      i += 1 + match[0].length;
    } else if (path[i] === "[") {
      const rest = path.slice(i);
      const wildcard = /^\[\*\]/.exec(rest);
      const last = /^\[-1:\]/.exec(rest);
      const numeric = /^\[(\d+)\]/.exec(rest);
      const quoted = /^\[("(?:[^"\\]|\\.)*")\]/.exec(rest);
      if (wildcard) {
        segments.push(WILDCARD);
        i += wildcard[0].length;
      } else if (last) {
        segments.push(LAST);
        i += last[0].length;
      } else if (numeric) {
        segments.push(Number(numeric[1]));
        i += numeric[0].length;
      } else if (quoted) {
        try {
          segments.push(JSON.parse(quoted[1]) as string);
        } catch {
          return null;
        }
        i += quoted[0].length;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  return segments;
}

export function crumbLabel(segment: PathSegment): string {
  return segment === WILDCARD
    ? "[*]"
    : segment === LAST
      ? "[last]"
      : typeof segment === "number"
        ? `[${segment}]`
        : segment;
}

function truncateEnd(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Compact "root › … › leaf" label for a mapping, shared by the prompt pills
 * and any collapsed-path surface. The leaf is the semantically loaded part;
 * an index/wildcard/last-entry leaf keeps its parent key ("tool_calls[*]") because a
 * bare "[0]" says nothing. The full path belongs in a tooltip.
 */
export function formatMappingLabel(
  columnLabel: string,
  jsonSelector: string | null,
): string {
  if (!jsonSelector) return columnLabel;
  const segments = jsonPathToSegments(jsonSelector);
  // Opaque path (filters, slices, …): fall back to the raw selector.
  if (segments === null || segments.length === 0)
    return `${columnLabel} › ${truncateEnd(jsonSelector, 20)}`;

  // Leaf = last segment; pull in the parent key for index/wildcard leaves.
  const last = segments[segments.length - 1];
  let leaf = crumbLabel(last);
  let covered = 1;
  if (typeof last !== "string" && segments.length >= 2) {
    const parent = segments[segments.length - 2];
    if (typeof parent === "string") {
      leaf = `${truncateEnd(parent, 16)}${leaf}`;
      covered = 2;
    }
  }
  const hasHiddenMiddle = segments.length > covered;
  return [
    columnLabel,
    ...(hasHiddenMiddle ? ["…"] : []),
    truncateEnd(leaf, 20),
  ].join(" › ");
}
