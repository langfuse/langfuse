/* eslint-disable no-nested-ternary */
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { buildScoreOutputDefinition } from "@/src/features/evals/v2/fns/scoreOutput/buildScoreOutputDefinition";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import type { EvaluatorSetupStoreState } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import {
  buildDecisionModelDraftQuestions,
  DECISION_MODEL_DRAFT_STATE_MAPPING,
} from "@/src/features/evals/v2/fns/evaluators/decisionModelDraft";

type EvaluatorSetupDraftState = Pick<
  EvaluatorSetupStoreState,
  | "type"
  | "name"
  | "promptMessages"
  | "instructions"
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
  const promptMessagesValid =
    getPromptMessagesValidationError(params.promptMessages) === null;
  const mappings =
    params.type === "LLM_AS_JUDGE"
      ? buildEvaluatorVariableMappings({
          promptMessages: params.promptMessages,
          variableFields: params.variableFields,
        })
      : [];

  if (params.type === "DECISION_MODEL") {
    const questions = buildDecisionModelDraftQuestions({
      instructions: params.instructions,
      scoreName: params.name,
      scoreOutput: params.scoreOutput,
    });
    const definition =
      questions && params.selectedModel
        ? {
            type: params.type,
            questions,
            modelConfig: {
              provider: params.selectedModel.provider,
              model: params.selectedModel.model,
            },
            variableMapping: DECISION_MODEL_DRAFT_STATE_MAPPING,
          }
        : null;
    return { definition, mappings };
  }

  const definition =
    params.type === "LLM_AS_JUDGE"
      ? outputDefinition && promptMessagesValid
        ? {
            type: params.type,
            promptMessages: params.promptMessages,
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
