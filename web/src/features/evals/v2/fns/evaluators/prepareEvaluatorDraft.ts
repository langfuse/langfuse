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
>;

export function prepareEvaluatorDraft(params: EvaluatorSetupDraftState) {
  const outputDefinition = buildScoreOutputDefinition(params.scoreOutput);
  const mappings =
    params.type === "LLM_AS_JUDGE"
      ? buildEvaluatorVariableMappings({
          prompt: params.prompt,
          variableFields: params.variableFields,
        })
      : [];
  const definition =
    params.type === "LLM_AS_JUDGE"
      ? outputDefinition
        ? {
            type: params.type,
            prompt: params.prompt,
            modelConfig:
              params.modelMode === "custom" && params.selectedModel
                ? {
                    provider: params.selectedModel.provider,
                    model: params.selectedModel.model,
                    modelParams: params.modelParams,
                  }
                : null,
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
