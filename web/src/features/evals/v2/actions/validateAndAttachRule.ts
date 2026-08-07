import { z } from "zod";

import { observationVariableMapping, type FilterState } from "@langfuse/shared";
import { evaluationVariableMappingResolves } from "@/src/features/evals/v2/lib/evaluationVariableMapping";
import { type RouterInputs } from "@/src/utils/api";

type EvaluatorConfig = {
  scoreName: string;
  targetObject: string;
  variableMapping: unknown;
  evalTemplate: {
    id: string;
    type: string;
    prompt: string | null;
    sourceCode: string | null;
    sourceCodeLanguage: string | null;
    provider: string | null;
    model: string | null;
    modelParams: unknown;
    outputDefinition: unknown;
  } | null;
};

type SampleObservation = {
  id: string;
  traceId: string | null;
  startTime: Date;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
};

type EvaluatorType = "LLM_AS_JUDGE" | "CODE" | "unknown";
type ValidationOutcome = "passed" | "failed" | "unavailable";

export type EvaluationRuleAttachmentValidationIssue = {
  outcome: Exclude<ValidationOutcome, "passed">;
  message: string;
  requiresMappingReview?: true;
};

export type ValidateAndAttachEvaluationRuleResult = {
  attached: true;
  issue?: EvaluationRuleAttachmentValidationIssue;
};

export type ValidateEvaluationRuleAttachmentResult =
  | { valid: true }
  | ({ valid: false } & EvaluationRuleAttachmentValidationIssue);

type Dependencies = {
  getEvaluator: () => Promise<EvaluatorConfig | null>;
  getEvaluationRule: () => Promise<{
    filter: FilterState;
    targetObject: string;
  }>;
  getSample: (filter: FilterState) => Promise<SampleObservation | null>;
  runCodeTest: (
    input: RouterInputs["evalsV2"]["testRunCodeEval"],
  ) => Promise<{ success: boolean; error?: string }>;
  attach: () => Promise<unknown>;
  captureValidation: (properties: {
    outcome: ValidationOutcome;
    evaluatorType: EvaluatorType;
  }) => void;
};

type ValidationDependencies = Omit<Dependencies, "attach">;

const codeLanguageSchema = z.enum(["PYTHON", "TYPESCRIPT"]);

function captureValidation(
  dependencies: Pick<Dependencies, "captureValidation">,
  properties: Parameters<Dependencies["captureValidation"]>[0],
) {
  try {
    dependencies.captureValidation(properties);
  } catch {
    // Analytics must never change whether a validated evaluator is attached.
  }
}

function validationIssue(
  dependencies: Pick<ValidationDependencies, "captureValidation">,
  evaluatorType: EvaluatorType,
  outcome: EvaluationRuleAttachmentValidationIssue["outcome"],
  message: string,
  options?: Pick<
    EvaluationRuleAttachmentValidationIssue,
    "requiresMappingReview"
  >,
): ValidateEvaluationRuleAttachmentResult {
  captureValidation(dependencies, { outcome, evaluatorType });
  return { valid: false, outcome, message, ...options };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasCompleteLlmVariableMappings(
  mapping: z.infer<typeof observationVariableMapping>[],
  prompt: string,
) {
  const promptVariables = getPromptVariables(prompt);

  return (
    mapping.every(
      ({ templateVariable, selectedColumnId }) =>
        templateVariable.trim() !== "" && selectedColumnId.trim() !== "",
    ) &&
    promptVariables.every((variable) =>
      mapping.some(({ templateVariable }) => templateVariable === variable),
    )
  );
}

function getPromptVariables(prompt: string) {
  return Array.from(
    new Set(
      [...prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]),
    ),
  );
}

function allLlmVariableMappingsResolve(
  mapping: z.infer<typeof observationVariableMapping>[],
  prompt: string,
  sample: SampleObservation,
) {
  const sampleData = {
    input: sample.input,
    output: sample.output,
    metadata: sample.metadata,
  };

  return getPromptVariables(prompt).every((variable) => {
    const variableMapping = mapping.find(
      ({ templateVariable }) => templateVariable === variable,
    );
    if (!variableMapping) return false;

    return evaluationVariableMappingResolves(sampleData, variableMapping);
  });
}

/**
 * LLM evaluators validate mappings against a matching observation. Code
 * evaluators execute once because mapping resolution cannot prove user code.
 */
export async function validateRuleAttachment(
  projectId: string,
  dependencies: ValidationDependencies,
): Promise<ValidateEvaluationRuleAttachmentResult> {
  const [evaluator, evaluationRule] = await Promise.all([
    dependencies.getEvaluator(),
    dependencies.getEvaluationRule(),
  ]);
  const template = evaluator?.evalTemplate;
  const evaluatorType: EvaluatorType =
    template?.type === "CODE"
      ? "CODE"
      : template?.type === "LLM_AS_JUDGE"
        ? "LLM_AS_JUDGE"
        : "unknown";

  if (!evaluator || !template) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      "The evaluator definition could not be loaded.",
    );
  }
  if (evaluator.targetObject !== evaluationRule.targetObject) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "failed",
      "The evaluator and evaluation rule use different data types.",
    );
  }
  if (evaluationRule.targetObject !== "event") {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      "Automatic validation is currently available for observation rules only.",
    );
  }

  const mapping = z
    .array(observationVariableMapping)
    .safeParse(evaluator.variableMapping);
  if (!mapping.success) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "failed",
      "The evaluator has invalid variable mappings.",
      { requiresMappingReview: true },
    );
  }

  if (evaluatorType === "LLM_AS_JUDGE") {
    if (
      !template.prompt?.trim() ||
      !hasCompleteLlmVariableMappings(mapping.data, template.prompt)
    ) {
      return validationIssue(
        dependencies,
        evaluatorType,
        "failed",
        "Please complete all prompt variable mappings.",
        { requiresMappingReview: true },
      );
    }
  }

  let sample: SampleObservation | null;
  try {
    sample = await dependencies.getSample(evaluationRule.filter);
  } catch (error) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      `The evaluator test could not load a matching observation: ${errorMessage(error)}`,
    );
  }
  if (!sample?.traceId) {
    captureValidation(dependencies, {
      outcome: "unavailable",
      evaluatorType,
    });
    return { valid: true };
  }

  if (evaluatorType === "LLM_AS_JUDGE") {
    if (
      !allLlmVariableMappingsResolve(mapping.data, template.prompt!, sample)
    ) {
      return validationIssue(
        dependencies,
        evaluatorType,
        "failed",
        "The evaluator's prompt variables could not all be filled from an observation matched by this evaluation rule.",
        { requiresMappingReview: true },
      );
    }

    captureValidation(dependencies, { outcome: "passed", evaluatorType });
    return { valid: true };
  }

  let testResult: { success: boolean; error?: string };
  try {
    if (evaluatorType === "CODE") {
      const sourceCodeLanguage = codeLanguageSchema.safeParse(
        template.sourceCodeLanguage,
      );
      if (!template.sourceCode || !sourceCodeLanguage.success) {
        return validationIssue(
          dependencies,
          evaluatorType,
          "failed",
          "The code evaluator definition is incomplete.",
        );
      }
      testResult = await dependencies.runCodeTest({
        projectId,
        sourceCode: template.sourceCode,
        sourceCodeLanguage: sourceCodeLanguage.data,
        scoreName: evaluator.scoreName,
        mapping: mapping.data,
        observationId: sample.id,
        traceId: sample.traceId,
        observationStartTime: sample.startTime,
      });
    } else {
      return validationIssue(
        dependencies,
        evaluatorType,
        "failed",
        "The evaluator definition is incomplete.",
      );
    }
  } catch (error) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      `The evaluator test could not be completed: ${errorMessage(error)}`,
    );
  }

  if (!testResult.success) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "failed",
      testResult.error
        ? testResult.error
        : "The evaluator failed against an observation matched by this evaluation rule.",
    );
  }

  captureValidation(dependencies, { outcome: "passed", evaluatorType });
  return { valid: true };
}

export async function validateAndAttachRule(
  projectId: string,
  dependencies: Dependencies,
): Promise<ValidateAndAttachEvaluationRuleResult> {
  await dependencies.attach();
  let result: ValidateEvaluationRuleAttachmentResult;
  try {
    result = await validateRuleAttachment(projectId, dependencies);
  } catch (error) {
    return {
      attached: true,
      issue: {
        outcome: "unavailable",
        message: `The evaluator was attached, but its variable mapping could not be validated: ${errorMessage(error)}`,
      },
    };
  }
  if (!result.valid) {
    return {
      attached: true,
      issue: {
        outcome: result.outcome,
        message: result.message,
        ...(result.requiresMappingReview
          ? { requiresMappingReview: true as const }
          : {}),
      },
    };
  }

  return { attached: true };
}
