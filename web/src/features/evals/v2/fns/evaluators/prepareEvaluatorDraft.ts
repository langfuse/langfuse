import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { buildScoreOutputDefinition } from "@/src/features/evals/v2/fns/scoreOutput/buildScoreOutputDefinition";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import type { EvaluatorSetupStoreState } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

type EvaluatorSetupDraftState = Pick<
  EvaluatorSetupStoreState,
  | "type"
  | "prompt"
  | "sourceCode"
  | "sourceCodeLanguage"
  | "scoreOutput"
  | "variableFields"
  | "modelMode"
  | "selectedModel"
  | "modelParams"
  | "initialDefinition"
> &
  Partial<Pick<EvaluatorSetupStoreState, "promptMessages">>;

export function prepareEvaluatorDraft(params: EvaluatorSetupDraftState) {
  const outputDefinition = buildScoreOutputDefinition(params.scoreOutput);
  const promptMessages = params.promptMessages ?? [
    { role: "user" as const, content: params.prompt },
  ];
  const promptMessagesValid =
    getPromptMessagesValidationError(promptMessages) === null;
  const mappings =
    params.type === "LLM_AS_JUDGE"
      ? buildEvaluatorVariableMappings({
          prompt: params.prompt,
          variableFields: params.variableFields,
        })
      : [];
  const variables = mappings.map(({ variable }) => variable);
  const definition =
    params.type === "LLM_AS_JUDGE"
      ? outputDefinition && promptMessagesValid
        ? {
            type: params.type,
            prompt: params.prompt,
            promptMessages,
            provider:
              params.modelMode === "custom"
                ? (params.selectedModel?.provider ?? null)
                : null,
            model:
              params.modelMode === "custom"
                ? (params.selectedModel?.model ?? null)
                : null,
            modelParams:
              params.modelMode === "custom" ? params.modelParams : null,
            vars: variables,
            variableMapping: mappings.map(({ variable, fieldState }) => ({
              templateVariable: variable,
              selectedColumnId: fieldState.selectedColumnId,
              jsonSelector: fieldState.jsonSelector,
            })),
            outputDefinition,
          }
        : null
      : params.sourceCode.trim()
        ? {
            type: params.type,
            sourceCode: params.sourceCode,
            sourceCodeLanguage: params.sourceCodeLanguage,
          }
        : null;

  return {
    definition,
    mappings,
  };
}
