import { describe, expect, it, vi } from "vitest";
import { serializeEvaluatorChatPrompt } from "../../features/evals/evaluatorChatPrompt";
import { createNumericEvalOutputDefinition } from "../../features/evals/outputDefinition";
import { executeLlmEvaluator } from "./llmEvaluatorExecution";

describe("executeLlmEvaluator", () => {
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

  it("preserves chat message roles while interpolating variables", async () => {
    const callLlm = vi.fn().mockResolvedValue({
      score: 1,
      reasoning: "Done",
    });

    await executeLlmEvaluator({
      templatePrompt: serializeEvaluatorChatPrompt([
        { role: "system", content: "Judge {{input}}" },
        { role: "user", content: "Input: {{input}}" },
        { role: "assistant", content: "I will score it." },
      ]),
      variables: [{ var: "input", value: "hello" }],
      outputDefinition: createNumericEvalOutputDefinition({
        scoreDescription: "Score",
        reasoningDescription: "Reasoning",
      }),
      callLlm,
    });

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { type: "system", role: "system", content: "Judge hello" },
          { type: "user", role: "user", content: "Input: hello" },
          {
            type: "assistant-text",
            role: "assistant",
            content: "I will score it.",
          },
        ],
      }),
    );
  });
});
