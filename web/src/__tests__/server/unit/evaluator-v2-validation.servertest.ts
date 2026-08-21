import { EvalTemplateType } from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEvaluatorDefinitionConfigurationError: vi.fn(),
  isCodeEvalEnabled: vi.fn(),
  isCodeEvalSourceCodeLanguageSupported: vi.fn(),
}));

vi.mock("@/src/features/evals/server/evaluator-preflight", () => ({
  getEvaluatorDefinitionConfigurationError:
    mocks.getEvaluatorDefinitionConfigurationError,
}));

vi.mock("@/src/features/evals/server/isCodeEvalEnabled", () => ({
  isCodeEvalEnabled: mocks.isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported:
    mocks.isCodeEvalSourceCodeLanguageSupported,
}));

import { assertEvaluatorConfigurationValid } from "@/src/features/evals/v2/server/evaluators/evaluatorValidation";
import { CreateEvaluatorSchema } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

describe("evaluator configuration validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isCodeEvalEnabled.mockReturnValue(true);
    mocks.isCodeEvalSourceCodeLanguageSupported.mockReturnValue(true);
    mocks.getEvaluatorDefinitionConfigurationError.mockResolvedValue(null);
  });

  it("accepts evaluator names longer than 200 characters", () => {
    expect(
      CreateEvaluatorSchema.safeParse({
        projectId: "project-id",
        name: "e".repeat(201),
        description: null,
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{output}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: null,
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }).success,
    ).toBe(true);
  });

  it("validates deployment capabilities without executing the evaluator", async () => {
    const codeDefinition = {
      type: EvalTemplateType.CODE,
      sourceCode: "return 1;",
      sourceCodeLanguage: "TYPESCRIPT" as const,
      variableMapping: null,
    };

    mocks.isCodeEvalEnabled.mockReturnValueOnce(false);
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "Code evaluator",
        definition: codeDefinition,
      }),
    ).rejects.toThrow("Code evaluations are not enabled");

    mocks.isCodeEvalSourceCodeLanguageSupported.mockReturnValueOnce(false);
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "Code evaluator",
        definition: codeDefinition,
      }),
    ).rejects.toThrow("language is not supported");

    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{output}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: null,
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(
      mocks.getEvaluatorDefinitionConfigurationError,
    ).toHaveBeenCalledOnce();
  });

  it("rejects evaluator variables that do not match the prompt", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{input}} and {{output}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: null,
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).rejects.toThrow("Evaluator variables must match the prompt variables");
  });

  it("rejects incomplete evaluator default mappings", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{input}} and {{output}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["input", "output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).rejects.toThrow("Missing mappings for evaluator variables: input");
  });

  it("rejects unsupported JSONPath expressions in variable mappings", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{input}}",
          provider: null,
          model: null,
          modelParams: null,
          vars: ["input"],
          variableMapping: [
            {
              templateVariable: "input",
              selectedColumnId: "input",
              jsonSelector: '$.messages[?(@.id[2] == "HumanMessage")]',
            },
          ],
          outputDefinition: {
            version: 2,
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).rejects.toThrow(
      "Filter expressions ([?...]) are not supported and will not be applied.",
    );
  });
});
