import { eventTargetEvalVariableColumns } from "@langfuse/shared";

/** Display name of a sample-observation field, falling back to its raw id. */
export function evalVariableColumnLabel(columnId: string | null) {
  if (!columnId) return null;
  return (
    eventTargetEvalVariableColumns.find((column) => column.id === columnId)
      ?.name ?? columnId
  );
}
