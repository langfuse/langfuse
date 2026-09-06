import {
  experimentTargetEvalVariableColumns,
  type CodeEvalTemplateVariable,
} from "@langfuse/shared";

/** Display name of a sample-observation field, falling back to its raw id. */
export function evalVariableColumnLabel(
  columnId: string | null,
  labels?: Partial<Record<CodeEvalTemplateVariable, string>>,
) {
  if (!columnId) return null;
  const localizedLabel = labels?.[columnId as CodeEvalTemplateVariable];
  if (localizedLabel) return localizedLabel;
  return (
    experimentTargetEvalVariableColumns.find((column) => column.id === columnId)
      ?.name ?? columnId
  );
}
