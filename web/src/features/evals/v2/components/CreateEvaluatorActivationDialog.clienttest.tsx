import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: () => <div>Estimated daily cost</div>,
}));

import { CreateEvaluatorActivationDialog } from "./CreateEvaluatorActivationDialog";

describe("CreateEvaluatorActivationDialog", () => {
  it("asks how to save before creating the evaluator", () => {
    const onSave = vi.fn();

    render(
      <CreateEvaluatorActivationDialog
        projectId="project-1"
        setupFilter={[]}
        setupSampling={1}
        testRunCostUsd={0.002}
        isCodeEvaluator={false}
        open
        loading={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Save and start running?")).toBeInTheDocument();
    expect(screen.queryByText(/evaluator is saved/i)).not.toBeInTheDocument();
    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save only" }));
    expect(onSave).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Save & run" }));
    expect(onSave).toHaveBeenCalledWith(true);
  });
});
