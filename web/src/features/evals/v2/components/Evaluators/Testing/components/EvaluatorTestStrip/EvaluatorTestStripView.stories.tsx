import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorTestStripView } from "./EvaluatorTestStripView";

const meta = preview.meta({ component: EvaluatorTestStripView });

const baseArgs = {
  open: true,
  onOpenChange: fn(),
  testResult: null,
  isPending: false,
  disabledReason: null,
  onRunTest: fn(),
  rawOpen: false,
  onRawOpenChange: fn(),
  executionTraceId: null,
  onOpenExecutionTrace: fn(),
};

const longReasoning =
  "The response identifies the duplicate charge and refunds the second one, which is what the customer asked for. The tone is empathetic and the resolution fields are clear. However, the reply states several details that are not in the input: the customer's name, the claim that both charges hit within five seconds, and a payment retry bug as the root cause. Presenting these as confirmed facts overstates certainty.";

export const Collapsed = meta.story({
  args: { ...baseArgs, open: false, state: { status: "empty" } },
});

export const CannotRun = meta.story({
  args: {
    ...baseArgs,
    open: false,
    state: { status: "empty" },
    disabledReason: "Select a model before running a test.",
  },
});

export const Running = meta.story({
  args: { ...baseArgs, isPending: true, state: { status: "running" } },
});

export const Score = meta.story({
  args: {
    ...baseArgs,
    executionTraceId: "trace-1",
    state: {
      status: "llm-success",
      score: "0.65",
      reasoning:
        "The reply refunds the duplicate charge but adds unverified details.",
    },
  },
});

export const LongReasoning = meta.story({
  args: {
    ...baseArgs,
    executionTraceId: "trace-1",
    state: { status: "llm-success", score: "0.65", reasoning: longReasoning },
  },
});

export const ScoreWithoutReasoning = meta.story({
  args: {
    ...baseArgs,
    state: { status: "llm-success", score: "billing", reasoning: null },
  },
});

export const CodeScores = meta.story({
  args: {
    ...baseArgs,
    state: {
      status: "code-success",
      scores: [
        {
          name: "exact_match",
          value: "true",
          comment: "Output equals the expected answer.",
        },
        { name: "length", value: "42", comment: null },
      ],
    },
  },
});

export const DecisionAnswers = meta.story({
  args: {
    ...baseArgs,
    executionTraceId: "trace-1",
    state: {
      status: "decision-success",
      results: [
        {
          questionId: "q1",
          scoreName: "topic",
          instructions: "Which topic best matches `input`?",
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.91, support: 0.09 },
          confidence: 0.91,
        },
        {
          questionId: "q2",
          scoreName: "refund_request",
          instructions: "Does `input` request a refund?",
          type: "noul",
          probability: 0.87,
        },
      ],
    },
  },
});

export const RunError = meta.story({
  args: {
    ...baseArgs,
    state: {
      status: "run-error",
      message:
        "The model returned output that does not match the score format.",
    },
  },
});

export const RequestError = meta.story({
  args: {
    ...baseArgs,
    state: { status: "request-error", message: "The test request timed out." },
  },
});

export const RawOutput = meta.story({
  args: {
    ...baseArgs,
    rawOpen: true,
    executionTraceId: "trace-1",
    testResult: {
      success: true,
      result: {
        score: 0.65,
        reasoning: "The reply refunds the duplicate charge.",
      },
      durationMs: 1840,
    },
    state: {
      status: "llm-success",
      score: "0.65",
      reasoning: "The reply refunds the duplicate charge.",
    },
  },
});
