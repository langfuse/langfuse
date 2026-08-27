import { act, render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { TestSectionContainer } from "./TestSectionContainer";

vi.mock(
  "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard",
  () => ({
    TestRunCard: ({ hasValidModel }: { hasValidModel: boolean }) => (
      <div>{hasValidModel ? "Model valid" : "Model missing"}</div>
    ),
  }),
);

describe("TestSectionContainer", () => {
  it("subscribes to model availability inside the test section", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });

    render(
      <TooltipProvider>
        <TestSectionContainer
          projectId="project-1"
          store={store}
          defaultModel={null}
          testResult={null}
          testPending={false}
          rawResultOpen={false}
          onRawResultOpenChange={vi.fn()}
          onRunTest={vi.fn()}
          onOpenExecutionTrace={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Model missing")).toBeInTheDocument();

    act(() => {
      store
        .getState()
        .actions.selectModel({ provider: "openai", model: "gpt-4.1-mini" });
    });

    expect(screen.getByText("Model valid")).toBeInTheDocument();
  });
});
