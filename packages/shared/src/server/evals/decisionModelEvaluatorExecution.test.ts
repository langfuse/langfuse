import { describe, expect, it, vi } from "vitest";
import {
  DecisionModelQuestionsSchema,
  type DecisionModelQuestions,
} from "../../features/evals/decisionModel";
import {
  DecisionModelEvaluatorError,
  executeDecisionModelEvaluator,
  type DecisionModelClient,
  type DecisionModelEvaluation,
} from "./decisionModelEvaluatorExecution";

const questions: DecisionModelQuestions = DecisionModelQuestionsSchema.parse([
  {
    id: "readiness",
    scoreName: "send_readiness",
    type: "choice",
    instructions: "Is `reply` ready to send as an answer to `question`?",
    options: [
      { value: "ready", description: "Answers and states the next step" },
      { value: "needs_revision" },
    ],
  },
  {
    id: "frustration",
    scoreName: "customer_frustration",
    type: "score",
    instructions: "How frustrated is the customer in `question`?",
    levels: [
      { description: "Calm" },
      { description: "Frustrated but civil" },
      { description: "Very angry" },
    ],
  },
  {
    id: "refund",
    scoreName: "refund_requested",
    type: "noul",
    instructions: "Does `question` request a refund?",
  },
]);

const evaluation: DecisionModelEvaluation = {
  model: "jev-1.13.0",
  answers: {
    readiness: {
      type: "choice",
      choice: "ready",
      probabilities: { ready: 0.91, needs_revision: 0.09 },
      confidence: 0.82,
    },
    frustration: {
      type: "score",
      score: 1.26,
      probabilities: { "0": 0, "1": 0.74, "2": 0.26 },
      confidence: 0.61,
    },
    refund: { type: "boolean", probability: 0.97 },
  },
  usage: { inputTokens: 300, outputTokens: 9 },
};

function createClient(result: DecisionModelEvaluation) {
  const evaluate = vi.fn().mockResolvedValue(result);
  const client: DecisionModelClient = { evaluate };
  return { client, evaluate };
}

describe("executeDecisionModelEvaluator", () => {
  it("sends the mapped fields as state and every question in one request", async () => {
    const { client, evaluate } = createClient(evaluation);

    await executeDecisionModelEvaluator({
      variables: [
        { var: "question", value: "Can I get a refund? Third time asking." },
        { var: "reply", value: "" },
        { var: "expected", value: null },
        { var: "tools", value: undefined },
      ],
      questions,
      client,
    });

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith({
      state: {
        question: "Can I get a refund? Third time asking.",
        reply: "",
      },
      questions: {
        readiness: {
          type: "choice",
          instructions: "Is `reply` ready to send as an answer to `question`?",
          criteria: {
            ready: "Answers and states the next step",
            needs_revision: null,
          },
        },
        frustration: {
          type: "score",
          instructions: "How frustrated is the customer in `question`?",
          criteria: ["Calm", "Frustrated but civil", "Very angry"],
        },
        refund: {
          type: "boolean",
          instructions: "Does `question` request a refund?",
        },
      },
    });
  });

  it("writes one score per question with certainty in metadata", async () => {
    const { client } = createClient(evaluation);

    const { scores } = await executeDecisionModelEvaluator({
      variables: [{ var: "question", value: "refund?" }],
      questions,
      client,
    });

    expect(scores).toEqual([
      {
        name: "send_readiness",
        dataType: "CATEGORICAL",
        value: "ready",
        comment:
          "ready (p=0.91) · confidence 0.82 · runner-up needs_revision (0.09) · jev-1.13.0",
        metadata: {
          decisionModel: {
            questionId: "readiness",
            type: "choice",
            model: "jev-1.13.0",
            choice: "ready",
            confidence: 0.82,
            probabilities: { ready: 0.91, needs_revision: 0.09 },
          },
        },
      },
      {
        name: "customer_frustration",
        dataType: "NUMERIC",
        value: 1.26,
        comment:
          '1.26 ≈ level 1 "Frustrated but civil" · confidence 0.61 · jev-1.13.0',
        metadata: {
          decisionModel: {
            questionId: "frustration",
            type: "score",
            model: "jev-1.13.0",
            confidence: 0.61,
            probabilities: { "0": 0, "1": 0.74, "2": 0.26 },
            legend: {
              "0": "Calm",
              "1": "Frustrated but civil",
              "2": "Very angry",
            },
          },
        },
      },
      {
        name: "refund_requested",
        dataType: "NUMERIC",
        value: 0.97,
        comment: "P(true)=0.97 · jev-1.13.0",
        metadata: {
          decisionModel: {
            questionId: "refund",
            type: "noul",
            model: "jev-1.13.0",
          },
        },
      },
    ]);
  });

  it("fails permanently when the state is empty", async () => {
    const { client, evaluate } = createClient(evaluation);

    await expect(
      executeDecisionModelEvaluator({
        variables: [{ var: "question", value: null }],
        questions,
        client,
      }),
    ).rejects.toBeInstanceOf(DecisionModelEvaluatorError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a missing answer",
      { ...evaluation, answers: { ...evaluation.answers, refund: undefined } },
    ],
    [
      "a wrongly typed answer",
      {
        ...evaluation,
        answers: {
          ...evaluation.answers,
          refund: { type: "score", score: 1, probabilities: {}, confidence: 1 },
        },
      },
    ],
    [
      "a choice outside the options",
      {
        ...evaluation,
        answers: {
          ...evaluation.answers,
          readiness: {
            type: "choice",
            choice: "constructor",
            probabilities: { constructor: 1 },
            confidence: 1,
          },
        },
      },
    ],
  ] as const)("fails permanently on %s", async (_label, broken) => {
    const { client } = createClient(broken as DecisionModelEvaluation);

    await expect(
      executeDecisionModelEvaluator({
        variables: [{ var: "question", value: "refund?" }],
        questions,
        client,
      }),
    ).rejects.toBeInstanceOf(DecisionModelEvaluatorError);
  });
});
