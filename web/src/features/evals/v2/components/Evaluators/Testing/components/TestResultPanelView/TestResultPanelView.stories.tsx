import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { TestRerunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRerunButton/TestRerunButton";
import {
  TestResultTraceActions,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActions/TestResultTraceActions";
import { TestResultPanelView } from "./TestResultPanelView";

const meta = preview.meta({ component: TestResultPanelView });

const actions = {
  onRawOpenChange: fn(),
  onRerun: fn(),
  onOpenExecutionTrace: fn(),
};

const traceActions = (executionTraceId: string | null) => (
  <TestResultTraceActions
    executionTraceId={executionTraceId}
    onOpenExecutionTrace={actions.onOpenExecutionTrace}
  >
    <DropdownMenuTrigger asChild>
      <TestResultTraceActionsTrigger />
    </DropdownMenuTrigger>
  </TestResultTraceActions>
);

const rerunAction = (isPending: boolean, disabledReason: string | null) => (
  <TestRerunButton
    isPending={isPending}
    disabledReason={disabledReason}
    onRerun={actions.onRerun}
  />
);

export const LlmSuccess = meta.story({
  args: {
    title: "LLM Output",
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
    traceActions: traceActions("trace-execution"),
    rerunAction: rerunAction(false, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const CodeSuccess = meta.story({
  args: {
    title: "Code Output",
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
    traceActions: traceActions("trace-execution"),
    rerunAction: rerunAction(false, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const BooleanCodeSuccess = meta.story({
  name: "Boolean Code Success",
  args: {
    title: "Code Output",
    result: {
      status: "code-success",
      scores: [
        {
          name: "Factuality",
          value: "true",
          comment: "The response is factually correct.",
        },
        {
          name: "Contains PII",
          value: "false",
          comment: null,
        },
      ],
    },
    durationMs: 280,
    estimatedCostUsd: null,
    rawOutput: {
      scores: [
        { name: "Factuality", value: 1, dataType: "BOOLEAN" },
        { name: "Contains PII", value: 0, dataType: "BOOLEAN" },
      ],
    },
    rawOpen: false,
    traceActions: traceActions("trace-execution"),
    rerunAction: rerunAction(false, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const Error = meta.story({
  args: {
    title: "LLM Output",
    result: {
      status: "run-error",
      message: "The evaluator did not return a valid score.",
    },
    durationMs: 480,
    estimatedCostUsd: null,
    rawOutput: { error: "Invalid score output" },
    rawOpen: false,
    traceActions: traceActions(null),
    rerunAction: rerunAction(false, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const Empty = meta.story({
  args: {
    title: "LLM Output",
    result: { status: "empty" },
    durationMs: null,
    estimatedCostUsd: null,
    rawOutput: null,
    rawOpen: false,
    traceActions: traceActions(null),
    rerunAction: rerunAction(false, "Select a sample observation first."),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const Running = meta.story({
  args: {
    title: "LLM Output",
    result: { status: "running" },
    durationMs: null,
    estimatedCostUsd: null,
    rawOutput: null,
    rawOpen: false,
    traceActions: traceActions(null),
    rerunAction: rerunAction(true, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});

export const RawOutput = meta.story({
  args: {
    title: "LLM Output",
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
    traceActions: traceActions("trace-execution"),
    rerunAction: rerunAction(false, null),
    onRawOpenChange: actions.onRawOpenChange,
  },
});
