import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

/** The decision-model state, one mapping per key in declared order. */
export function buildDecisionModelStateFields({
  stateKeys,
  variableFields,
}: {
  stateKeys: string[];
  variableFields: Record<string, VariableFieldState>;
}) {
  return stateKeys.map((variable) => ({
    variable,
    fieldState: variableFields[variable] ?? {
      selectedColumnId: inferDefaultMapping(variable).selectedColumnId ?? null,
      jsonSelector: null,
    },
  }));
}
