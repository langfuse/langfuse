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
import {
  CreateEvaluatorSchema,
  ListEvaluatorsSchema,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

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
          promptMessages: [{ role: "user", content: "Judge {{output}}" }],
          modelConfig: null,
          variableMapping: null,
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }).success,
    ).toBe(true);
  });

  it("requires prompt messages at the evaluator API boundary", () => {
    expect(
      CreateEvaluatorSchema.safeParse({
        projectId: "project-id",
        name: "Legacy prompt evaluator",
        description: null,
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          prompt: "Judge {{output}}",
          modelConfig: null,
          variableMapping: null,
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("accepts text filters for evaluator models", () => {
    expect(
      ListEvaluatorsSchema.safeParse({
        projectId: "project-id",
        filter: [
          {
            column: "model",
            type: "string",
            operator: "contains",
            value: "gpt",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates deployment capabilities without executing the evaluator", async () => {
    const codeDefinition = {
      type: EvalTemplateType.CODE,
      sourceCode: "return 1;",
      sourceCodeLanguage: "TYPESCRIPT" as const,
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
          promptMessages: [{ role: "user", content: "Judge {{output}}" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: null,
          outputDefinition: {
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

  // The schema is the only boundary that can see a caller-supplied mapping:
  // every consumer of `assertEvaluatorConfigurationValid` hands it a parsed
  // definition, so a code evaluator can never carry one by the time it runs.
  it.each([null, [{ templateVariable: "input", selectedColumnId: "input" }]])(
    "rejects code evaluator definitions carrying a variable mapping (%j)",
    (variableMapping) => {
      expect(
        CreateEvaluatorSchema.safeParse({
          projectId: "project-id",
          name: "Code evaluator",
          description: null,
          definition: {
            type: EvalTemplateType.CODE,
            sourceCode: "return 1;",
            sourceCodeLanguage: "TYPESCRIPT" as const,
            variableMapping,
          },
        }).success,
      ).toBe(false);
    },
  );

  it("rejects system messages after the first prompt message", async () => {
    const definition = {
      type: EvalTemplateType.LLM_AS_JUDGE,
      promptMessages: [
        { role: "user" as const, content: "Judge {{output}}" },
        { role: "system" as const, content: "Be strict" },
      ],
      provider: null,
      model: null,
      modelParams: null,
      vars: ["output"],
      variableMapping: null,
      outputDefinition: {
        version: 2 as const,
        dataType: "NUMERIC" as const,
        score: { description: "Quality" },
        reasoning: { description: "Reasoning" },
      },
    };

    expect(
      CreateEvaluatorSchema.safeParse({
        projectId: "project-id",
        name: "LLM evaluator",
        description: null,
        definition,
      }).success,
    ).toBe(false);

    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition,
      }),
    ).rejects.toThrow(
      "System messages are only allowed as the first prompt message",
    );
  });

  it("rejects empty prompt messages", async () => {
    const definition = {
      type: EvalTemplateType.LLM_AS_JUDGE,
      promptMessages: [
        { role: "user" as const, content: "Judge {{output}}" },
        { role: "assistant" as const, content: "   " },
      ],
      provider: null,
      model: null,
      modelParams: null,
      vars: ["output"],
      variableMapping: null,
      outputDefinition: {
        version: 2 as const,
        dataType: "NUMERIC" as const,
        score: { description: "Quality" },
        reasoning: { description: "Reasoning" },
      },
    };

    expect(
      CreateEvaluatorSchema.safeParse({
        projectId: "project-id",
        name: "LLM evaluator",
        description: null,
        definition,
      }).success,
    ).toBe(false);

    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition,
      }),
    ).rejects.toThrow("Add content to every prompt message before saving.");
  });

  it("rejects evaluator variables that do not match the prompt", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [
            { role: "user", content: "Judge {{input}} and {{output}}" },
          ],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: null,
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).rejects.toThrow("Evaluator variables must match the prompt variables");
  });

  it("rejects mappings that reference variables not in the prompt", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [{ role: "user", content: "Judge {{output}}" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
            {
              templateVariable: "item_metadata",
              selectedColumnId: "experimentItemMetadata",
            },
          ],
          outputDefinition: {
            dataType: "NUMERIC",
            score: { description: "Quality" },
            reasoning: { description: "Reasoning" },
          },
        },
      }),
    ).rejects.toThrow(
      "Mappings reference unknown evaluator variables: item_metadata",
    );
  });

  it("rejects incomplete evaluator default mappings", async () => {
    await expect(
      assertEvaluatorConfigurationValid({
        projectId: "project-id",
        name: "LLM evaluator",
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [
            { role: "user", content: "Judge {{input}} and {{output}}" },
          ],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["input", "output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
          outputDefinition: {
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
          promptMessages: [{ role: "user", content: "Judge {{input}}" }],
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
