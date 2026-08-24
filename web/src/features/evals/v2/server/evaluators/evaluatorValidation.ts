import {
  EvalTemplateType,
  extractVariables,
  InvalidRequestError,
  observationVariableMappingList,
} from "@langfuse/shared";
import { getEvaluatorDefinitionConfigurationError } from "@/src/features/evals/server/evaluator-preflight";
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

export function assertEvaluatorVariablesMatchPrompt(params: {
  prompt: string;
  variables: string[];
}) {
  const promptVariables = extractVariables(params.prompt);
  if (
    promptVariables.length !== params.variables.length ||
    promptVariables.some((variable) => !params.variables.includes(variable))
  ) {
    throw new InvalidRequestError(
      "Evaluator variables must match the prompt variables",
    );
  }
}

export function assertCompleteEvaluatorVariableMapping(params: {
  prompt: string;
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

  const promptVariables = extractVariables(params.prompt);
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
    (variable) => !promptVariables.includes(variable),
  );
  if (unknownVariables.length > 0) {
    throw new InvalidRequestError(
      `Mappings reference unknown evaluator variables: ${unknownVariables.join(", ")}`,
    );
  }

  const missingVariables = promptVariables.filter(
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

  assertEvaluatorVariablesMatchPrompt({
    prompt: params.definition.prompt,
    variables: params.definition.vars,
  });
  if (params.definition.variableMapping !== null) {
    assertCompleteEvaluatorVariableMapping({
      prompt: params.definition.prompt,
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
