import { render, screen, within } from "@testing-library/react";

import { TestResultPanelView } from "./TestResultPanelView";

describe("TestResultPanelView", () => {
  it("groups the score and reasoning as LLM output", () => {
    render(
      <TestResultPanelView
        result={{
          status: "llm-success",
          score: "0.8",
          reasoning: "The response addresses the requested criteria.",
        }}
        durationMs={1640}
        estimatedCostUsd={0.000986}
        rawOutput={{ score: 0.8 }}
        rawOpen={false}
        onRawOpenChange={vi.fn()}
        isRerunning={false}
        rerunDisabledReason={null}
        onRerun={vi.fn()}
        onOpenSampleTrace={null}
        executionTraceId={null}
        onOpenExecutionTrace={null}
      />,
    );

    const llmOutput = screen.getByText("LLM output").parentElement;
    expect(llmOutput).not.toBeNull();
    if (!llmOutput) throw new Error("Expected an LLM output section");

    expect(within(llmOutput).getByText("Score")).toBeInTheDocument();
    expect(within(llmOutput).getByText("0.8")).toBeInTheDocument();
    expect(within(llmOutput).getByText("Model reasoning")).toBeInTheDocument();
    expect(
      within(llmOutput).getByText(
        "The response addresses the requested criteria.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run again" })).toBeVisible();
  });

  it("groups returned scores and comments as code output", () => {
    render(
      <TestResultPanelView
        result={{
          status: "code-success",
          scores: [
            {
              name: "Accuracy",
              value: "0.8",
              comment: "The expected answer is present.",
            },
          ],
        }}
        durationMs={320}
        estimatedCostUsd={null}
        rawOutput={{ scores: [{ name: "Accuracy", value: 0.8 }] }}
        rawOpen={false}
        onRawOpenChange={vi.fn()}
        isRerunning={false}
        rerunDisabledReason={null}
        onRerun={vi.fn()}
        onOpenSampleTrace={null}
        executionTraceId={null}
        onOpenExecutionTrace={null}
      />,
    );

    const codeOutput = screen.getByText("Code output").parentElement;
    expect(codeOutput).not.toBeNull();
    if (!codeOutput) throw new Error("Expected a code output section");

    expect(within(codeOutput).getByText("Accuracy")).toBeInTheDocument();
    expect(within(codeOutput).getByText("0.8")).toBeInTheDocument();
    expect(within(codeOutput).getByText("Comment")).toBeInTheDocument();
    expect(
      within(codeOutput).getByText("The expected answer is present."),
    ).toBeInTheDocument();
  });

  it("uses only the rerun spinner for the running state", () => {
    render(
      <TestResultPanelView
        result={{ status: "running" }}
        durationMs={null}
        estimatedCostUsd={null}
        rawOutput={null}
        rawOpen={false}
        onRawOpenChange={vi.fn()}
        isRerunning={true}
        rerunDisabledReason={null}
        onRerun={vi.fn()}
        onOpenSampleTrace={null}
        executionTraceId={null}
        onOpenExecutionTrace={null}
      />,
    );

    expect(screen.queryByText("Running…")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Run the test again" }),
    ).toBeVisible();
  });
});
