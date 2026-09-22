import preview from "../../../../../../../../.storybook/preview";
import { DecisionModelResultView } from "./DecisionModelResultView";

const meta = preview.meta({ component: DecisionModelResultView });

export const AllTypes = meta.story({
  args: {
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

/** Expected values at both ends of the scale keep their labels inside the track. */
export const ScoreAtEdges = meta.story({
  args: {
    results: [
      {
        questionId: "q1",
        type: "score",
        scoreName: "customer_frustration",
        instructions: "How frustrated is the customer in `input`?",
        score: 0,
        levels: [
          "Calm, just stating facts",
          "Frustrated but civil",
          "Very angry",
        ],
        probabilities: { "0": 1, "1": 0, "2": 0 },
        confidence: 1,
      },
      {
        questionId: "q2",
        type: "score",
        scoreName: "urgency",
        instructions: "How urgent is `input`?",
        score: 2,
        levels: ["Can wait", "This week", "Right now"],
        probabilities: { "0": 0, "1": 0, "2": 1 },
        confidence: 1,
      },
    ],
  },
});
