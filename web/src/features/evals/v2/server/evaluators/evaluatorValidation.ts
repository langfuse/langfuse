import {
  EvalTemplateType,
  extractVariables,
  InvalidRequestError,
  observationVariableMappingList,
} from "@langfuse/shared";
import {
  DefaultEvalModelService,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getLLMErrorInfo,
  isAllowedDecisionModel,
  isDecisionModelAdapter,
  LLMAdapter,
  OPENAI_DECISION_MODEL_IDS,
} from "@langfuse/shared/src/server";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";
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

  if (params.definition.type === EvalTemplateType.DECISION_MODEL) {
    await assertDecisionModelDefinitionValid({
      projectId: params.projectId,
      name: params.name,
      definition: params.definition,
    });
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

  if (params.definition.provider !== null) {
    const connection = await DefaultEvalModelService.fetchValidModelConfig(
      params.projectId,
      params.definition.provider,
      params.definition.model ?? undefined,
    );
    if (
      connection.valid &&
      isDecisionModelAdapter(connection.config.apiKey.adapter)
    ) {
      throw new EvaluatorModelConfigurationError(
        `Connection "${params.definition.provider}" is a decision-model connection and cannot be used for LLM-as-a-judge. Choose a text-generation model or switch the evaluator type to decision model.`,
      );
    }
  }

  try {
    const error = await getEvaluatorDefinitionPreflightError(
      {
        projectId: params.projectId,
        template: {
          name: params.name,
          type: params.definition.type,
          provider: params.definition.provider,
          model: params.definition.model,
          modelParams: params.definition.modelParams,
          outputDefinition: params.definition.outputDefinition,
        },
      },
      { throwOnOperationalError: true },
    );
    if (error) throw new EvaluatorModelConfigurationError(error);
  } catch (error) {
    const llmError = getLLMErrorInfo(error);
    if (llmError?.kind === "timeout") {
      const timeoutSeconds =
        getClientInitiatedNonStreamingLlmTimeoutMs() / 1000;
      throw new EvaluatorConfigurationError(
        `The model did not respond within ${timeoutSeconds} seconds during evaluator validation. The evaluator was not saved. Retry or check your LLM connection and model settings.`,
      );
    }
    if (llmError && (llmError.isRetryable || llmError.kind === "abort")) {
      const message =
        llmError.kind === "abort"
          ? "The model request was aborted during evaluator validation."
          : "The LLM provider could not complete the model request during evaluator validation.";
      throw new EvaluatorConfigurationError(
        `${message} The evaluator was not saved. Retry or check your LLM connection and model settings.`,
      );
    }
    throw error;
  }
}

export async function getDecisionModelConfigurationError(params: {
  projectId: string;
  name: string;
  definition: Pick<
    Extract<EvaluatorDefinition, { type: "DECISION_MODEL" }>,
    "provider" | "model" | "questions"
  >;
}): Promise<string | null> {
  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    params.projectId,
    params.definition.provider,
    params.definition.model,
  );
  if (!modelConfig.valid) {
    return `No decision-model connection found for evaluator "${params.name}". ${modelConfig.error}. Add an OpenAI connection using ${OPENAI_DECISION_MODEL_IDS.join(", ")}, or a TypeSafe connection, under Settings → LLM Connections (/project/${params.projectId}/settings/llm-connections) first.`;
  }
  if (
    !isAllowedDecisionModel(
      modelConfig.config.apiKey.adapter,
      modelConfig.config.model,
    )
  ) {
    if (modelConfig.config.apiKey.adapter === LLMAdapter.OpenAI) {
      return `Model "${modelConfig.config.model}" is not supported for decision models. Use ${OPENAI_DECISION_MODEL_IDS.join(", ")}.`;
    }
    return `Connection "${params.definition.provider}" is not a decision-model connection. Decision-model evaluators need an OpenAI connection using ${OPENAI_DECISION_MODEL_IDS.join(", ")}, or a TypeSafe connection.`;
  }
  const missingLabel = params.definition.questions.some(
    (question) =>
      question.type === "score" &&
      modelConfig.config.apiKey.adapter === LLMAdapter.OpenAI &&
      question.levels.some((level) => !level.label),
  );
  if (missingLabel) {
    return "Each OpenAI score level needs a label.";
  }
  const missingDescription = params.definition.questions.some(
    (question) =>
      question.type === "score" &&
      modelConfig.config.apiKey.adapter !== LLMAdapter.OpenAI &&
      question.levels.some((level) => level.description == null),
  );
  if (missingDescription) {
    return "Each score level needs a description.";
  }
  return null;
}

async function assertDecisionModelDefinitionValid(params: {
  projectId: string;
  name: string;
  definition: Extract<EvaluatorDefinition, { type: "DECISION_MODEL" }>;
}) {
  if (params.definition.vars.length === 0) {
    throw new InvalidRequestError(
      "Decision-model evaluators need at least one state field",
    );
  }
  assertCompleteEvaluatorVariableMapping({
    promptVariables: params.definition.vars,
    variableMapping: params.definition.variableMapping,
  });

  const error = await getDecisionModelConfigurationError(params);
  if (error) throw new EvaluatorModelConfigurationError(error);
}
