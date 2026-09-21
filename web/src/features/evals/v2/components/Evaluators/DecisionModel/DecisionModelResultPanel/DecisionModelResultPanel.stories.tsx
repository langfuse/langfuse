import preview from "../../../../../../../../.storybook/preview";
import { DecisionModelResultPanel } from "./DecisionModelResultPanel";

const meta = preview.meta({ component: DecisionModelResultPanel });

const REQUEST = {
  state: {
    input: "My order #4411 arrived broken and I want my money back.",
    output:
      "I'm sorry about that. I've issued a full refund for order #4411; it will show up within 3-5 business days.",
  },
  questions: {
    send_readiness: {
      type: "choice",
      instructions: "Is `output` ready to send as an answer to `input`?",
      criteria: {
        ready: "Answers the request and states the next step.",
        needs_revision: "Accurate but incomplete or unclear.",
        unsafe: "Contradicts policy or invents information.",
      },
    },
    customer_frustration: {
      type: "score",
      instructions: "How frustrated is the customer in `input`?",
      criteria: [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language or threatening to leave",
      ],
    },
    refund_requested: {
      type: "noul",
      instructions: "Does `input` request a refund?",
    },
  },
};

export const AllTypes = meta.story({
  args: {
    model: "jev-1.13.0",
    durationMs: 412,
    request: REQUEST,
    results: [
      {
        questionId: "q1",
        type: "choice",
        scoreName: "send_readiness",
        instructions: "Is `output` ready to send as an answer to `input`?",
        choice: "ready",
        probabilities: { ready: 0.86, needs_revision: 0.11, unsafe: 0.03 },
        confidence: 0.82,
      },
      {
        questionId: "q2",
        type: "score",
        scoreName: "customer_frustration",
        instructions: "How frustrated is the customer in `input`?",
        score: 1.28,
        levels: [
          "Calm, just stating facts",
          "Frustrated but civil",
          "Very angry, strong language or threatening to leave",
        ],
        probabilities: { "0": 0.08, "1": 0.56, "2": 0.36 },
        confidence: 0.61,
      },
      {
        questionId: "q3",
        type: "noul",
        scoreName: "refund_requested",
        instructions: "Does `input` request a refund?",
        probability: 0.97,
      },
    ],
  },
});

export const LowConfidence = meta.story({
  args: {
    model: "jev-1.13.0",
    durationMs: 388,
    request: REQUEST,
    results: [
      {
        questionId: "q1",
        type: "choice",
        scoreName: "send_readiness",
        instructions: "Is `output` ready to send as an answer to `input`?",
        choice: "needs_revision",
        probabilities: { ready: 0.41, needs_revision: 0.44, unsafe: 0.15 },
        confidence: 0.31,
      },
      {
        questionId: "q3",
        type: "noul",
        scoreName: "refund_requested",
        instructions: "Does `input` request a refund?",
        probability: 0.52,
      },
    ],
  },
});
