/**
 * Serializes any JSON-compatible value to a human-readable string.
 * Returns bare string values without JSON quotes.
 *
 * Extracted from CodeJsonViewer.tsx and PrettyJsonView.tsx to avoid duplication.
 */
export function stringifyJsonNode(node: unknown): string {
  // return single string nodes without quotes
  if (typeof node === "string") {
    return node;
  }

  try {
    return JSON.stringify(
      node,
      (_key, value) => {
        switch (typeof value) {
          case "bigint":
            return String(value) + "n";
          case "number":
          case "boolean":
          case "object":
          case "string":
            return value as string;
          default:
            return String(value);
        }
      },
      4,
    );
  } catch (error) {
    console.error("JSON stringify error", error);
    return "Error: JSON.stringify failed";
  }
}
