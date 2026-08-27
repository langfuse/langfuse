import { describe, expect, it, vi } from "vitest";
import { createNumericEvalOutputDefinition } from "../../features/evals/outputDefinition";
import { executeLlmEvaluator } from "./llmEvaluatorExecution";

describe("executeLlmEvaluator", () => {
  it("loads a legacy string prompt as one user message", async () => {
    const callLlm = vi.fn().mockResolvedValue({ score: 1 });

    await executeLlmEvaluator({
      templatePrompt: "legacy {{input}}",
      variables: [{ var: "input", value: "prompt" }],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "score",
        reasoningDescription: "reasoning",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: "legacy prompt",
          }),
        ],
      }),
    );
  });

  it("preserves message order and roles while interpolating each message", async () => {
    const callLlm = vi.fn().mockResolvedValue({ score: 1 });

    await executeLlmEvaluator({
      templatePrompt: "legacy fallback",
      templatePromptMessages: [
        { role: "system", content: "Judge {{input}}" },
        { role: "user", content: "Response: {{output}}" },
        { role: "assistant", content: "Return only the score" },
      ],
      variables: [
        { var: "input", value: "quality" },
        { var: "output", value: "great" },
      ],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "score",
        reasoningDescription: "reasoning",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system", content: "Judge quality" }),
          expect.objectContaining({ role: "user", content: "Response: great" }),
          expect.objectContaining({
            role: "assistant",
            content: "Return only the score",
          }),
        ],
      }),
    );
  });

  it("uses production prompt interpolation and validates the model output", async () => {
    const callLlm = vi.fn().mockResolvedValue({
      score: 0.8,
      reasoning: "The response is relevant.",
    });

    const result = await executeLlmEvaluator({
      templatePrompt:
        "input={{input}} metadata={{metadata}} missing={{missing}}",
      variables: [
        { var: "input", value: "hello" },
        { var: "metadata", value: { source: "test" } },
      ],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "Relevance score",
        reasoningDescription: "Why the response received this score",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            type: "user",
            role: "user",
            content:
              'input=hello metadata={"source":"test"} missing={{missing}}',
          }),
        ],
      }),
    );
    expect(result.output).toEqual({
      success: true,
      data: {
        dataType: "NUMERIC",
        score: 0.8,
        reasoning: "The response is relevant.",
      },
    });
  });
});
