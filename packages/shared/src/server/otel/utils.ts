export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
}

const LANGGRAPH_CONTROL_FLOW_EXCEPTION_MARKERS = [
  "langgraph.errors.GraphInterrupt",
  "langgraph.errors.GraphBubbleUp",
];

export function isLangGraphControlFlowInterruptSpan(span: {
  status?: { code?: number };
  events?: Array<{
    name?: string;
    attributes?: Array<{ key?: string; value?: Record<string, unknown> }>;
  }>;
}): boolean {
  if (span.status?.code !== 2) {
    return false;
  }

  for (const event of span.events ?? []) {
    if (event.name !== "exception") {
      continue;
    }

    for (const attr of event.attributes ?? []) {
      if (attr.key !== "exception.type") {
        continue;
      }

      const typeValue = String(
        (attr.value as { stringValue?: string } | undefined)?.stringValue ?? "",
      );
      if (
        LANGGRAPH_CONTROL_FLOW_EXCEPTION_MARKERS.some((marker) =>
          typeValue.includes(marker),
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Flattens a nested JSON object into path-based names and string values.
 * For example: {foo: {bar: "baz", num: 42}} becomes:
 * - names: ["foo.bar", "foo.num"]
 * - values: ["baz", "42"]
 *
 * All values are converted to strings for consistent storage.
 */
export function flattenJsonToPathArrays(
  obj: Record<string, unknown>,
  prefix: string = "",
): { names: string[]; values: Array<string | null | undefined> } {
  const names: string[] = [];
  const values: Array<string | null | undefined> = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Recursively flatten nested objects
      const nested = flattenJsonToPathArrays(
        value as Record<string, unknown>,
        path,
      );
      names.push(...nested.names);
      values.push(...nested.values);
    } else {
      // Leaf value - convert to string
      names.push(path);
      if (value === null || value === undefined || typeof value === "string") {
        values.push(value);
      } else {
        values.push(JSON.stringify(value));
      }
    }
  }

  return { names, values };
}
