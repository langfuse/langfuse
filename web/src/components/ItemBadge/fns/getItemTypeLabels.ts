import { type LangfuseItemType } from "@/src/utils/itemType";

/**
 * `"DATASET_RUN"` -> `{ label: "Dataset_run", displayLabel: "Dataset run" }`.
 * `label` titles the element, `displayLabel` is what the user reads.
 */
export function getItemTypeLabels(type: LangfuseItemType) {
  const label =
    String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();
  return { label, displayLabel: label.replace(/_/g, " ") };
}
