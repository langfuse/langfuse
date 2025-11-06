export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
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
