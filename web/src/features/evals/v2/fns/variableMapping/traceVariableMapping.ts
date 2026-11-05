import { CODE_EVAL_TEMPLATE_VARIABLES } from "@langfuse/shared";

const observationDataColumns = new Set<string>(CODE_EVAL_TEMPLATE_VARIABLES);

export const OBSERVATION_DATA_BINDING_ERROR =
  "This variable is bound to observation data. Map it to threads.";

export function isObservationDataColumn(columnId: string | null) {
  return columnId != null && observationDataColumns.has(columnId);
}
