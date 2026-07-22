import { z } from "zod";

import {
  observationVariableMapping,
  PersistedEvalOutputDefinitionSchema,
  type FilterState,
} from "@langfuse/shared";
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
};

type EvaluatorType = "LLM_AS_JUDGE" | "CODE" | "unknown";
type ValidationOutcome = "passed" | "failed" | "unavailable";

export type EvaluationRuleAttachmentValidationIssue = {
  outcome: Exclude<ValidationOutcome, "passed">;
  message: string;
};

export type ValidateAndAttachEvaluationRuleResult =
  | { attached: true }
  | ({ attached: false } & EvaluationRuleAttachmentValidationIssue);

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
  runLlmTest: (
    input: RouterInputs["evalsV2"]["testRunLlmJudge"],
  ) => Promise<{ success: boolean; error?: string }>;
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
const modelParamsSchema = z.record(z.string(), z.unknown()).nullable();

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
): ValidateEvaluationRuleAttachmentResult {
  captureValidation(dependencies, { outcome, evaluatorType });
  return { valid: false, outcome, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasCompleteLlmVariableMappings(
  mapping: z.infer<typeof observationVariableMapping>[],
  prompt: string,
) {
  const promptVariables = Array.from(
    new Set(
      [...prompt.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]),
    ),
  );

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

/**
 * Evaluators run once against a matching observation before activation.
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
      "The evaluator definition could not be loaded. The evaluator was not attached to the evaluation rule.",
    );
  }
  if (evaluator.targetObject !== evaluationRule.targetObject) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "failed",
      "The evaluator and evaluation rule use different data types. The evaluator was not attached to the evaluation rule.",
    );
  }
  if (evaluationRule.targetObject !== "event") {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      "Automatic validation is currently available for observation rules only. The evaluator was not attached to the evaluation rule.",
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
      "The evaluator has invalid variable mappings. The evaluator was not attached to the evaluation rule.",
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
        "Please complete all prompt variable mappings before attaching this evaluator to the evaluation rule.",
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
      `The evaluator test could not load a matching observation: ${errorMessage(error)} The evaluator was not attached to the evaluation rule.`,
    );
  }
  if (!sample?.traceId) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      "No observations currently match this evaluation rule, so the evaluator could not be tested. The evaluator was not attached to the evaluation rule.",
    );
  }

  let testResult: { success: boolean; error?: string };
  try {
    if (evaluatorType === "LLM_AS_JUDGE") {
      const modelParams = modelParamsSchema.safeParse(template.modelParams);
      const outputDefinition =
        PersistedEvalOutputDefinitionSchema.nullable().safeParse(
          template.outputDefinition,
        );
      if (!modelParams.success || !outputDefinition.success) {
        return validationIssue(
          dependencies,
          evaluatorType,
          "failed",
          "The evaluator definition is incomplete. The evaluator was not attached to the evaluation rule.",
        );
      }
      testResult = await dependencies.runLlmTest({
        projectId,
        prompt: template.prompt!,
        provider: template.provider,
        model: template.model,
        modelParams: modelParams.data,
        outputDefinition: outputDefinition.data,
        mapping: mapping.data,
        observationId: sample.id,
        traceId: sample.traceId,
        observationStartTime: sample.startTime,
      });
    } else if (evaluatorType === "CODE") {
      const sourceCodeLanguage = codeLanguageSchema.safeParse(
        template.sourceCodeLanguage,
      );
      if (!template.sourceCode || !sourceCodeLanguage.success) {
        return validationIssue(
          dependencies,
          evaluatorType,
          "failed",
          "The code evaluator definition is incomplete. The evaluator was not attached to the evaluation rule.",
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
        "The evaluator definition is incomplete. The evaluator was not attached to the evaluation rule.",
      );
    }
  } catch (error) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "unavailable",
      `The evaluator test could not be completed: ${errorMessage(error)} The evaluator was not attached to the evaluation rule.`,
    );
  }

  if (!testResult.success) {
    return validationIssue(
      dependencies,
      evaluatorType,
      "failed",
      testResult.error
        ? `${testResult.error} The evaluator was not attached to the evaluation rule.`
        : "The evaluator failed against an observation matched by this evaluation rule. The evaluator was not attached to the evaluation rule.",
    );
  }

  captureValidation(dependencies, { outcome: "passed", evaluatorType });
  return { valid: true };
}

export async function validateAndAttachRule(
  projectId: string,
  dependencies: Dependencies,
): Promise<ValidateAndAttachEvaluationRuleResult> {
  const result = await validateRuleAttachment(projectId, dependencies);
  if (!result.valid) {
    return {
      attached: false,
      outcome: result.outcome,
      message: result.message,
    };
  }

  await dependencies.attach();
  return { attached: true };
}
