/* eslint-disable no-nested-ternary */
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { buildScoreOutputDefinition } from "@/src/features/evals/v2/fns/scoreOutput/buildScoreOutputDefinition";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import type { EvaluatorSetupStoreState } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { draftsToQuestions } from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import { buildDecisionModelStateFields } from "@/src/features/evals/v2/fns/variableMapping/buildDecisionModelStateFields";

type EvaluatorSetupDraftState = Pick<
  EvaluatorSetupStoreState,
  | "type"
  | "name"
  | "promptMessages"
  | "questions"
  | "stateKeys"
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
  const mappings = (() => {
    if (params.type === "LLM_AS_JUDGE") {
      return buildEvaluatorVariableMappings({
        promptMessages: params.promptMessages,
        variableFields: params.variableFields,
      });
    }
    if (params.type === "DECISION_MODEL") {
      return buildDecisionModelStateFields({
        stateKeys: params.stateKeys,
        variableFields: params.variableFields,
      });
    }
    return [];
  })();

  if (params.type === "DECISION_MODEL") {
    const questions = draftsToQuestions(params.questions);
    // Every state key has to resolve to data, or the state the model sees
    // would silently miss a field the questions refer to.
    const variableMapping = mappings.flatMap(({ variable, fieldState }) =>
      fieldState.selectedColumnId
        ? [
            {
              templateVariable: variable,
              selectedColumnId: fieldState.selectedColumnId,
              jsonSelector: fieldState.jsonSelector,
            },
          ]
        : [],
    );
    const stateComplete =
      mappings.length > 0 && variableMapping.length === mappings.length;
    const definition =
      questions && params.selectedModel && stateComplete
        ? {
            type: params.type,
            questions,
            modelConfig: {
              provider: params.selectedModel.provider,
              model: params.selectedModel.model,
            },
            variableMapping,
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
