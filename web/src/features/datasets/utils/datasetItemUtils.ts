import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";
import type { Prisma } from "@langfuse/shared";

/**
 * Converts a dataset item field value to a formatted JSON string.
 * Returns empty string for null/undefined values.
 *
 * \uXXXX escapes (e.g. Japanese ingested with Python ensure_ascii=True) are
 * decoded so the value renders as real characters in the editor/viewer.
 */
export const stringifyDatasetItemData = (data: unknown): string => {
  if (!data) return "";

  try {
    return decodeUnicodeEscapesOnly(JSON.stringify(data, null, 2), true);
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
