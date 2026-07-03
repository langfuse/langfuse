import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { deepParseJson, parseJsonPrioritised, type Prisma } from "@langfuse/shared";

/**
 * Converts a dataset item field value to a formatted JSON string.
 * Returns empty string for null/undefined values.
 *
 * Nested values that are themselves JSON strings (common for OTLP-ingested
 * traces, whose attribute values are serialized to strings) are recursively
 * parsed into native JSON so they render/edit as clean, expandable JSON rather
 * than escaped strings — matching how the trace/observation viewer already
 * displays the same data via deepParseJson.
 */
export const stringifyDatasetItemData = (data: unknown): string => {
  if (!data) return "";

  try {
    // This field can arrive as a native object OR as a serialized JSON string
    // (some tRPC paths return metadata as a stringified envelope). Unwrap an
    // outer JSON string once so the envelope doesn't consume deepParseJson's
    // depth budget — otherwise nested leaves sit one level too deep and stay
    // escaped, unlike the trace/observation viewer which parses an object.
    const unwrapped =
      typeof data === "string" ? parseJsonPrioritised(data) : data;
    // deepParseJson mutates objects in place; clone so we never corrupt the
    // (shared) tRPC query-cache object this value is read from.
    const root =
      unwrapped && typeof unwrapped === "object"
        ? structuredClone(unwrapped)
        : unwrapped;
    return JSON.stringify(deepParseJson(root), null, 2);
  } catch {
    showErrorToast(
      "Failed to stringify data",
      "We are working on fixing this issue.",
    );
    return "";
  }
};

/**
 * Dataset schema shape used for validation
 */
export type DatasetSchema = {
  id: string;
  name: string;
  inputSchema: Prisma.JsonValue | null;
  expectedOutputSchema: Prisma.JsonValue | null;
};

/**
 * Transforms a full dataset object to the minimal schema shape needed for validation.
 * Ensures consistent dataset schema format across components.
 */
export const toDatasetSchema = (
  dataset: {
    id: string;
    name: string;
    inputSchema?: Prisma.JsonValue | null;
    expectedOutputSchema?: Prisma.JsonValue | null;
  } | null,
): DatasetSchema | null => {
  if (!dataset) return null;

  return {
    id: dataset.id,
    name: dataset.name,
    inputSchema: dataset.inputSchema ?? null,
    expectedOutputSchema: dataset.expectedOutputSchema ?? null,
  };
};
