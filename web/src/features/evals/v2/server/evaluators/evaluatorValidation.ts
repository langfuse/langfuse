import {
  EvalTemplateType,
  extractVariables,
  InvalidRequestError,
  observationVariableMappingList,
} from "@langfuse/shared";
import { getEvaluatorDefinitionConfigurationError } from "@/src/features/evals/server/evaluator-preflight";
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import { getJsonPathCompatibilityWarning } from "@/src/features/evals/utils/json-path-compatibility";
import {
  EvaluatorConfigurationError,
  EvaluatorModelConfigurationError,
} from "./evaluatorErrors";
import type { EvaluatorDefinition } from "./evaluatorTypes";

export function extractEvaluatorPromptVariables(
  promptMessages: Array<{ content: string }>,
) {
  return [
    ...new Set(
      promptMessages.flatMap(({ content }) => extractVariables(content)),
    ),
  ];
}

export function assertEvaluatorVariablesMatchPrompt(params: {
  promptVariables: string[];
  variables: string[];
}) {
  if (
    params.promptVariables.length !== params.variables.length ||
    params.promptVariables.some(
      (variable) => !params.variables.includes(variable),
    )
  ) {
    throw new InvalidRequestError(
      "Evaluator variables must match the prompt variables",
    );
  }
}

export function assertCompleteEvaluatorVariableMapping(params: {
  promptVariables: string[];
  variableMapping: unknown;
}) {
  const parsed = observationVariableMappingList.safeParse(
    params.variableMapping,
  );
  if (!parsed.success) {
    throw new InvalidRequestError("Evaluator variable mapping is invalid");
  }

  for (const mapping of parsed.data) {
    const compatibilityError = getJsonPathCompatibilityWarning(
      mapping.jsonSelector,
    );
    if (compatibilityError) {
      throw new InvalidRequestError(compatibilityError);
    }
  }

  const mappedVariables = parsed.data.map(
    ({ templateVariable }) => templateVariable,
  );
  const duplicateVariables = mappedVariables.filter(
    (variable, index) => mappedVariables.indexOf(variable) !== index,
  );
  if (duplicateVariables.length > 0) {
    throw new InvalidRequestError(
      `Duplicate mappings for evaluator variables: ${[...new Set(duplicateVariables)].join(", ")}`,
    );
  }

  const unknownVariables = mappedVariables.filter(
    (variable) => !params.promptVariables.includes(variable),
  );
  if (unknownVariables.length > 0) {
    throw new InvalidRequestError(
      `Mappings reference unknown evaluator variables: ${unknownVariables.join(", ")}`,
    );
  }

  const missingVariables = params.promptVariables.filter(
    (variable) => !mappedVariables.includes(variable),
  );
  if (missingVariables.length > 0) {
    throw new InvalidRequestError(
      `Missing mappings for evaluator variables: ${missingVariables.join(", ")}`,
    );
  }
}

export async function assertEvaluatorConfigurationValid(params: {
  projectId: string;
  name: string;
  definition: EvaluatorDefinition;
}) {
  if (params.definition.type === EvalTemplateType.CODE) {
    if (!isCodeEvalEnabled()) {
      throw new EvaluatorConfigurationError(
        "Code evaluations are not enabled for this deployment.",
      );
    }
    if (
      !isCodeEvalSourceCodeLanguageSupported(
        params.definition.sourceCodeLanguage,
      )
    ) {
      throw new EvaluatorConfigurationError(
        "This code evaluator language is not supported by the configured dispatcher.",
      );
    }
    return;
  }

  const promptMessagesValidationError = getPromptMessagesValidationError(
    params.definition.promptMessages,
  );
  if (promptMessagesValidationError) {
    throw new InvalidRequestError(promptMessagesValidationError);
  }

  const promptVariables = extractEvaluatorPromptVariables(
    params.definition.promptMessages,
  );
  assertEvaluatorVariablesMatchPrompt({
    promptVariables,
    variables: params.definition.vars,
  });
  if (params.definition.variableMapping !== null) {
    assertCompleteEvaluatorVariableMapping({
      promptVariables,
      variableMapping: params.definition.variableMapping,
    });
  }

  const error = await getEvaluatorDefinitionConfigurationError({
    projectId: params.projectId,
    template: {
      name: params.name,
      type: params.definition.type,
      provider: params.definition.provider,
      model: params.definition.model,
      modelParams: params.definition.modelParams,
      outputDefinition: params.definition.outputDefinition,
    },
  });
  if (error) throw new EvaluatorModelConfigurationError(error);
}
