import {
  extractVariables,
  type EvaluatorPromptMessage,
} from "@langfuse/shared";

import { inferDefaultMapping } from "../../../utils/evaluator-form-utils";
import type { VariableFieldState } from "../../types/variableMapping";

export function buildEvaluatorVariableMappings({
  promptMessages,
  variableFields,
}: {
  promptMessages: EvaluatorPromptMessage[];
  variableFields: Record<string, VariableFieldState>;
}) {
  const variables = [
    ...new Set(
      promptMessages.flatMap(({ content }) => extractVariables(content)),
    ),
  ];
  return variables.map((variable) => ({
    variable,
    fieldState: variableFields[variable] ?? {
      selectedColumnId: inferDefaultMapping(variable).selectedColumnId ?? null,
      jsonSelector: null,
    },
  }));
}
