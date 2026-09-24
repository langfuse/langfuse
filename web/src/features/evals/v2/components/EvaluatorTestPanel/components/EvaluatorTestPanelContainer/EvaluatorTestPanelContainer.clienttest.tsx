import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorTestPanelContainer } from "./EvaluatorTestPanelContainer";

vi.mock(
  "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel",
  () => ({
    EvaluatorTestPanel: ({ testSection }: { testSection: ReactNode }) =>
      testSection,
  }),
);

vi.mock(
  "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestSectionContainer/TestSectionContainer",
  () => ({
    TestSectionContainer: ({ hasValidModel }: { hasValidModel: boolean }) => (
      <div>{hasValidModel ? "Model available" : "Model missing"}</div>
    ),
  }),
);

describe("EvaluatorTestPanelContainer", () => {
  it("subscribes to model validity without requiring it from the page", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    render(
      <EvaluatorTestPanelContainer
        projectId="project-1"
        store={store}
        sampleSelector={null}
        testResult={null}
        testPending={false}
        rawResultOpen={false}
        onRawResultOpenChange={vi.fn()}
        onRunTest={vi.fn()}
        onOpenExecutionTrace={vi.fn()}
      />,
    );

    expect(screen.getByText("Model missing")).toBeInTheDocument();

    act(() => {
      store
        .getState()
        .actions.selectModel({ provider: "OpenAI", model: "gpt-4.1-mini" });
    });

    expect(screen.getByText("Model available")).toBeInTheDocument();
  });
});
