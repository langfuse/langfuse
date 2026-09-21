import { describe, expect, it, vi } from "vitest";
import {
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
} from "../../features/evals/outputDefinition";
import {
  DecisionModelEvaluatorError,
  executeDecisionModelEvaluator,
  type DecisionModelClient,
  type DecisionModelEvaluation,
} from "./decisionModelEvaluatorExecution";

const outputDefinition = createCategoricalEvalOutputDefinition({
  scoreDescription: "",
  reasoningDescription: "",
  categories: ["pass", "fail"],
});

function createClient(evaluation: DecisionModelEvaluation) {
  const evaluateChoice = vi.fn().mockResolvedValue(evaluation);
  const client: DecisionModelClient = { evaluateChoice };
  return { client, evaluateChoice };
}

describe("executeDecisionModelEvaluator", () => {
  it("sends the observation fields as state and the categories as choices", async () => {
    const { client, evaluateChoice } = createClient({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "pass",
        probabilities: { pass: 0.85, fail: 0.15 },
        confidence: 0.7,
      },
      usage: null,
    });

    await executeDecisionModelEvaluator({
      instructions: "Does the reply follow the refund policy?",
      variables: [
        { var: "input", value: { question: "refund?" } },
        { var: "output", value: "Yes, within 30 days." },
        { var: "toolCalls", value: null },
        { var: "experimentItemExpectedOutput", value: undefined },
      ],
      outputDefinition,
      client,
    });

    expect(evaluateChoice).toHaveBeenCalledWith({
      state: {
        input: { question: "refund?" },
        output: "Yes, within 30 days.",
      },
      question: {
        type: "choice",
        instructions: "Does the reply follow the refund policy?",
        criteria: { pass: null, fail: null },
      },
    });
  });

  it("maps the choice to a single categorical match with probabilities in metadata", async () => {
    const { client } = createClient({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "fail",
        probabilities: { pass: 0.32, fail: 0.68 },
        confidence: 0.57,
      },
      usage: { inputTokens: 120, outputTokens: 4 },
    });

    const result = await executeDecisionModelEvaluator({
      instructions: "Is the reply ready to send?",
      variables: [{ var: "output", value: "Full refund plus $50 credit." }],
      outputDefinition,
      client,
    });

    expect(result.output).toEqual({
      dataType: "CATEGORICAL",
      matches: ["fail"],
      reasoning:
        "fail (p=0.68) · confidence 0.57 · runner-up pass (0.32) · jev-1.13.0",
    });
    expect(result.scoreMetadata).toEqual({
      decisionModel: {
        model: "jev-1.13.0",
        choice: "fail",
        confidence: 0.57,
        probabilities: { pass: 0.32, fail: 0.68 },
      },
    });
  });

  it("rejects a choice outside the configured categories", async () => {
    const { client } = createClient({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "unsure",
        probabilities: { unsure: 1 },
        confidence: 1,
      },
      usage: null,
    });

    await expect(
      executeDecisionModelEvaluator({
        instructions: "Is the reply ready to send?",
        variables: [],
        outputDefinition,
        client,
      }),
    ).rejects.toBeInstanceOf(DecisionModelEvaluatorError);
  });

  it("rejects non-categorical and multi-match output definitions before calling the model", async () => {
    const { client, evaluateChoice } = createClient({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "pass",
        probabilities: { pass: 1, fail: 0 },
        confidence: 1,
      },
      usage: null,
    });

    await expect(
      executeDecisionModelEvaluator({
        instructions: "Rate it",
        variables: [],
        outputDefinition: createNumericEvalOutputDefinition({
          scoreDescription: "",
          reasoningDescription: "",
        }),
        client,
      }),
    ).rejects.toBeInstanceOf(DecisionModelEvaluatorError);

    await expect(
      executeDecisionModelEvaluator({
        instructions: "Rate it",
        variables: [],
        outputDefinition: createCategoricalEvalOutputDefinition({
          scoreDescription: "",
          reasoningDescription: "",
          categories: ["pass", "fail"],
          shouldAllowMultipleMatches: true,
        }),
        client,
      }),
    ).rejects.toBeInstanceOf(DecisionModelEvaluatorError);

    expect(evaluateChoice).not.toHaveBeenCalled();
  });
});
