export const MAPPABLE_COLUMNS = [
  { id: "input", label: "Input" },
  { id: "output", label: "Output" },
  { id: "metadata", label: "Metadata" },
];

export type VariableFieldState = {
  selectedColumnId: string | null;
  jsonSelector: string | null;
};
