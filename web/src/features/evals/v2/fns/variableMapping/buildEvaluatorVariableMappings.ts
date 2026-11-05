import {
  extractVariables,
  type EvaluatorPromptMessage,
} from "@langfuse/shared";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

export function buildEvaluatorVariableMappings({
  promptMessages,
  variableFields,
  defaultColumnId,
}: {
  promptMessages: EvaluatorPromptMessage[];
  variableFields: Record<string, VariableFieldState>;
  defaultColumnId?: string;
}) {
  const variables = [
    ...new Set(
      promptMessages.flatMap(({ content }) => extractVariables(content)),
    ),
  ];
  return variables.map((variable) => ({
    variable,
    fieldState: variableFields[variable] ?? {
      selectedColumnId:
        defaultColumnId ??
        inferDefaultMapping(variable).selectedColumnId ??
        null,
      jsonSelector: null,
    },
  }));
}
