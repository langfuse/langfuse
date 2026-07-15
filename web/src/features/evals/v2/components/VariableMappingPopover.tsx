/**
 * Shared vocabulary of the variable → observation-data mapping. The mapping
 * UI itself lives in VariableMappingPanel (the drill-down panel next to the
 * prompt editor); this module keeps the field list and mapping state shape
 * used across the panel, the manifest table, and the sample pick mode.
 */
export const MAPPABLE_COLUMNS = [
  { id: "input", label: "Input" },
  { id: "output", label: "Output" },
  { id: "metadata", label: "Metadata" },
];

export type VariableFieldState = {
  /** Null while the variable is not yet mapped to a field. */
  selectedColumnId: string | null;
  jsonSelector: string | null;
};
