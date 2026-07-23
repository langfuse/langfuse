import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { deepParseJson, parseJsonPrioritised, type Prisma } from "@langfuse/shared";

/**
 * Cleans up a dataset item JSON value before we show or edit it in the UI.
 * This is the one shared helper used by the read-only views (through
 * stringifyDatasetItemData), the item form (through formatJsonValue), and the
 * prefill-from-trace flow (through normalizePrefillValue).
 *
 * The value can come in as a real object (e.g. from the trace query cache) or
 * as a JSON string (some tRPC paths send metadata as a stringified wrapper).
 * So we:
 *   1. If it's a string, parse it once first. We do this before deepParseJson
 *      so the outer wrapper does not eat into deepParseJson's depth limit and
 *      leave the inner values still escaped.
 *   2. Clone objects, because deepParseJson changes them in place and the value
 *      comes from the shared query cache, which we must not touch.
 *   3. Deep-parse any nested JSON strings (e.g. OTLP attributes saved as
 *      strings) into real JSON, the same way the trace/observation viewer does.
 *
 * Mixed values work too: real objects stay as they are, JSON strings get
 * parsed, and plain (non-JSON) strings are left alone.
 */
export const normalizeDatasetJson = (value: unknown): unknown => {
  const unwrapped =
    typeof value === "string" ? parseJsonPrioritised(value) : value;
  const root =
    unwrapped && typeof unwrapped === "object"
      ? structuredClone(unwrapped)
      : unwrapped;
  return deepParseJson(root);
};

/**
 * Turns a dataset item field value into a formatted JSON string.
 * Returns an empty string for null/undefined values.
 *
 * Nested JSON strings are deep-parsed through normalizeDatasetJson so they show
 * as clean, expandable JSON instead of escaped strings, like the
 * trace/observation viewer.
 */
export const stringifyDatasetItemData = (data: unknown): string => {
  if (!data) return "";

  try {
    return JSON.stringify(normalizeDatasetJson(data), null, 2);
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
