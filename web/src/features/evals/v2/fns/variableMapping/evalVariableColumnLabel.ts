import { experimentTargetEvalVariableColumns } from "@langfuse/shared";

import { TRACE_TRANSCRIPT_SOURCE_COLUMNS } from "@/src/features/evals/v2/contexts/EvalVariableSourceColumnsProvider";

const sourceColumns = [
  ...experimentTargetEvalVariableColumns,
  ...TRACE_TRANSCRIPT_SOURCE_COLUMNS,
];

/** Display name of a sample field, falling back to its raw id. */
export function evalVariableColumnLabel(columnId: string | null) {
  if (!columnId) return null;
  return (
    sourceColumns.find((column) => column.id === columnId)?.name ?? columnId
  );
}
