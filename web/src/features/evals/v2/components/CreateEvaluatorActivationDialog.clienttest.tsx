import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  costEstimate: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: (props: Record<string, unknown>) => {
    mocks.costEstimate(props);
    return <div>Estimated usage &amp; cost</div>;
  },
}));

import { CreateEvaluatorActivationDialog } from "./CreateEvaluatorActivationDialog";

describe("CreateEvaluatorActivationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks how to save before creating the evaluator", () => {
    const onSave = vi.fn();
    const onRuleSamplingChange = vi.fn();

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
        onRuleSamplingChange={onRuleSamplingChange}
      />,
    );

    expect(screen.getByText("Save and start running?")).toBeInTheDocument();
    expect(screen.queryByText(/evaluator is saved/i)).not.toBeInTheDocument();
    expect(screen.getByText("Estimated usage & cost")).toBeInTheDocument();
    const estimateProps = mocks.costEstimate.mock.lastCall?.[0] as {
      onSamplingChange: (sampling: number) => void;
    };
    expect(estimateProps).toEqual(expect.objectContaining({ sampling: 1 }));
    estimateProps.onSamplingChange(0.25);
    expect(onRuleSamplingChange).toHaveBeenCalledWith("setup-rule", 0.25);

    fireEvent.click(screen.getByRole("button", { name: "Save only" }));
    expect(onSave).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Save & run" }));
    expect(onSave).toHaveBeenCalledWith(true);
  });

  it("reviews multiple rule changes with the existing cost preview", () => {
    const onSave = vi.fn();
    const onRuleSamplingChange = vi.fn();

    render(
      <CreateEvaluatorActivationDialog
        projectId="project-1"
        evaluatorId="evaluator-1"
        setupFilter={[]}
        setupSampling={1}
        testRunCostUsd={null}
        isCodeEvaluator={false}
        rulePreviews={[
          {
            id: "production-rule",
            name: "Production",
            filter: [{ column: "environment", value: ["production"] }] as never,
            sampling: 0.5,
          },
          {
            id: "staging-rule",
            name: "Staging",
            filter: [{ column: "environment", value: ["staging"] }] as never,
            sampling: 0.25,
          },
        ]}
        sharedRuleCount={1}
        open
        loading={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
        onRuleSamplingChange={onRuleSamplingChange}
      />,
    );

    expect(screen.getByText("Save rule changes?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You changed which observations this evaluator runs on. Save these changes to the rules it’s attached to?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/One changed rule is shared/)).toBeInTheDocument();
    expect(mocks.costEstimate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evaluatorId: "evaluator-1",
        sampling: 0.5,
      }),
    );

    const stagingTab = screen.getByRole("tab", { name: "Staging" });
    fireEvent.mouseDown(stagingTab, { button: 0, ctrlKey: false });
    fireEvent.click(stagingTab);
    const stagingEstimateProps = mocks.costEstimate.mock.lastCall?.[0] as {
      onSamplingChange: (sampling: number) => void;
    };
    expect(stagingEstimateProps).toEqual(
      expect.objectContaining({ evaluatorId: "evaluator-1", sampling: 0.25 }),
    );
    stagingEstimateProps.onSamplingChange(0.1);
    expect(onRuleSamplingChange).toHaveBeenCalledWith("staging-rule", 0.1);

    fireEvent.click(
      screen.getByRole("button", { name: "Save evaluator only" }),
    );
    expect(onSave).toHaveBeenCalledWith(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save evaluator & attached rules",
      }),
    );
    expect(onSave).toHaveBeenCalledWith(true);
  });
});
