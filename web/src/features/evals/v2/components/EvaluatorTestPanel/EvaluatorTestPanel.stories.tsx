import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { EvaluatorTestResult } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestResult/EvaluatorTestResult";
import { EvaluatorTestPanel } from "./EvaluatorTestPanel";
import { TestSection } from "./components/TestSection/TestSection";

const meta = preview.meta({ component: EvaluatorTestPanel });

const actions = {
  onOpenChange: fn(),
};

const sampleSelector = (
  <div className="bg-card rounded-md border p-4">
    <p>Sample observation</p>
    <p className="text-muted-foreground text-sm">
      checkout-assistant · generation
    </p>
  </div>
);

const testSection = (testResult: unknown = null) => (
  <TestSection
    content={
      <div className="bg-card rounded-md border p-4">
        {testResult ? "Test result" : "Ready to test"}
      </div>
    }
  />
);

export const ReadyToTest = meta.story({
  args: {
    onOpenChange: actions.onOpenChange,
    open: true,
    sampleSelector,
    testSection: testSection(),
  },
});

export const SuccessfulResult = meta.story({
  args: {
    onOpenChange: actions.onOpenChange,
    open: true,
    sampleSelector,
    testSection: testSection({
      result: {
        score: 0.9,
        reasoning: "The answer is factually correct and directly supported.",
      },
      executionTraceId: "trace-evaluator-execution",
    }),
  },
});

export const Collapsed = meta.story({
  args: {
    onOpenChange: actions.onOpenChange,
    open: false,
    sampleSelector,
    testSection: testSection(),
  },
});

const transcript = Array.from({ length: 12 }, (_, index) => ({
  role: index % 2 ? "assistant" : "user",
  parts: [{ type: "text", text: `Message ${index + 1}. `.repeat(40) }],
}));

export const PinnedLargeResult = meta.story({
  parameters: { layout: "fullscreen" },
  args: {
    onOpenChange: actions.onOpenChange,
    open: true,
    pinTestSection: true,
    sampleSelector,
    testSection: (
      <EvaluatorTestResult
        state={{
          status: "llm-success",
          score: "support_request",
          reasoning:
            "The user asks for help resetting their Wi-Fi password. ".repeat(8),
        }}
        testResult={{
          variables: [
            { var: "input", value: transcript },
            { var: "retrieved_reference_documents", value: transcript },
            { var: "output", value: "Open the router settings page." },
          ],
        }}
      />
    ),
  },
});
