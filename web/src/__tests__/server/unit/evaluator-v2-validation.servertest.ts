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

describe("evaluator configuration validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isCodeEvalEnabled.mockReturnValue(true);
    mocks.isCodeEvalSourceCodeLanguageSupported.mockReturnValue(true);
    mocks.getEvaluatorDefinitionConfigurationError.mockResolvedValue(null);
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
});
