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

const SYMBOL_SEGMENT_JSON_PATH = {
  [WILDCARD]: "[*]",
  [LAST]: "[-1:]",
} satisfies Record<Extract<PathSegment, symbol>, string>;

const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IDENTIFIER_PREFIX_REGEX = /^[A-Za-z_][A-Za-z0-9_]*/;
const BRACKET_SEGMENT_REGEX = /^\[(?:(\*)|(-1:)|(\d+)|("(?:[^"\\]|\\.)*"))\]/;

/** Segments → the JSONPath stored on the mapping ("$.messages[*].content"). */
export function segmentsToJsonPath(segments: PathSegment[]): string | null {
  if (segments.length === 0) return null;
  return (
    "$" +
    segments
      .map((segment) => {
        if (typeof segment === "symbol") {
          return SYMBOL_SEGMENT_JSON_PATH[segment];
        }
        if (typeof segment === "number") return `[${segment}]`;
        return IDENTIFIER_REGEX.test(segment)
          ? `.${segment}`
          : `[${JSON.stringify(segment)}]`;
      })
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
      const match = IDENTIFIER_PREFIX_REGEX.exec(path.slice(i + 1));
      if (!match) return null;
      segments.push(match[0]);
      i += 1 + match[0].length;
      continue;
    }

    if (path[i] === "[") {
      const match = BRACKET_SEGMENT_REGEX.exec(path.slice(i));
      if (!match) return null;

      const [, wildcard, last, numeric, quoted] = match;
      if (wildcard) {
        segments.push(WILDCARD);
      } else if (last) {
        segments.push(LAST);
      } else if (numeric) {
        segments.push(Number(numeric));
      } else if (quoted) {
        try {
          segments.push(JSON.parse(quoted) as string);
        } catch {
          return null;
        }
      }
      i += match[0].length;
      continue;
    }

    return null;
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

export function truncateEnd(label: string, max: number): string {
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
