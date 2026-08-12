import { extractVariables } from "@langfuse/shared";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

export function buildEvaluatorVariableMappings({
  prompt,
  variableFields,
}: {
  prompt: string;
  variableFields: Record<string, VariableFieldState>;
}) {
  return extractVariables(prompt).map((variable) => ({
    variable,
    fieldState: variableFields[variable] ?? {
      selectedColumnId: inferDefaultMapping(variable).selectedColumnId ?? null,
      jsonSelector: null,
    },
  }));
}
