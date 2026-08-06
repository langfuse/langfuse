import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { TestResultPanelView } from "./TestResultPanelView";

const meta = preview.meta({ component: TestResultPanelView });

const actions = {
  onRawOpenChange: fn(),
  onRerun: fn(),
  onOpenSampleTrace: fn(),
  onOpenExecutionTrace: fn(),
};

export const LlmSuccess = meta.story({
  args: {
    result: {
      status: "llm-success",
      score: "0.85",
      reasoning:
        "The response correctly identifies that SCIM synchronization and verifying group ID mapping—rather than group name—are key to resolving mapping issues after a group rename.",
    },
    durationMs: 1640,
    estimatedCostUsd: 0.000986,
    rawOutput: {
      score: 0.85,
      reasoning: "The response correctly identifies the key issue.",
    },
    rawOpen: false,
    isRerunning: false,
    rerunDisabledReason: null,
    executionTraceId: "trace-execution",
    ...actions,
  },
});

export const CodeSuccess = meta.story({
  args: {
    result: {
      status: "code-success",
      scores: [
        {
          name: "Accuracy",
          value: "0.85",
          comment: "The expected answer is present and factually correct.",
        },
        {
          name: "Conciseness",
          value: "1",
          comment: null,
        },
      ],
    },
    durationMs: 320,
    estimatedCostUsd: null,
    rawOutput: { scores: [{ name: "Accuracy", value: 0.85 }] },
    rawOpen: false,
    isRerunning: false,
    rerunDisabledReason: null,
    executionTraceId: "trace-execution",
    ...actions,
  },
});

export const Error = meta.story({
  args: {
    result: {
      status: "run-error",
      message: "The evaluator did not return a valid score.",
    },
    durationMs: 480,
    estimatedCostUsd: null,
    rawOutput: { error: "Invalid score output" },
    rawOpen: false,
    isRerunning: false,
    rerunDisabledReason: null,
    executionTraceId: null,
    ...actions,
  },
});

export const Empty = meta.story({
  args: {
    result: { status: "empty" },
    durationMs: null,
    estimatedCostUsd: null,
    rawOutput: null,
    rawOpen: false,
    isRerunning: false,
    rerunDisabledReason: "Select a sample observation first.",
    executionTraceId: null,
    ...actions,
  },
});

export const Running = meta.story({
  args: {
    result: { status: "running" },
    durationMs: null,
    estimatedCostUsd: null,
    rawOutput: null,
    rawOpen: false,
    isRerunning: true,
    rerunDisabledReason: null,
    executionTraceId: null,
    ...actions,
  },
});

export const RawOutput = meta.story({
  args: {
    result: {
      status: "llm-success",
      score: "0.85",
      reasoning: "The response is correct.",
    },
    durationMs: 1640,
    estimatedCostUsd: 0.000986,
    rawOutput: {
      score: 0.85,
      reasoning: "The response is correct.",
      variables: {
        input: "Where is my order?",
        expected_output: "Your order arrives tomorrow.",
      },
    },
    rawOpen: true,
    isRerunning: false,
    rerunDisabledReason: null,
    executionTraceId: "trace-execution",
    ...actions,
  },
});
