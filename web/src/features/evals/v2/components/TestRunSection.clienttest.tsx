import { render, screen } from "@testing-library/react";

import {
  TestResultPanel,
  type CodeTestRunMutation,
  type TestRunMutation,
} from "./TestRunSection";

describe("TestResultPanel", () => {
  it("groups the score and reasoning as LLM output", () => {
    const testRun = {
      data: {
        success: true,
        score: 0.8,
        reasoning: "The response addresses the requested criteria.",
        dataType: "NUMERIC",
        interpolatedPrompt: "Judge this response",
        extractedVariables: [],
        model: "judge-model",
        provider: "judge-provider",
        estimatedCostUsd: null,
      },
      error: null,
    } as unknown as TestRunMutation;

    render(
      <TestResultPanel
        isCodeMode={false}
        testRun={testRun}
        codeTestRun={{} as CodeTestRunMutation}
        isPending={false}
        disabledReason={null}
        onRerun={vi.fn()}
      />,
    );

    expect(screen.getByText("LLM output")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("0.8")).toBeInTheDocument();
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(
      screen.getByText("The response addresses the requested criteria."),
    ).toBeInTheDocument();
  });
});
