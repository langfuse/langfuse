import { describe, expect, it, vi } from "vitest";
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
});
