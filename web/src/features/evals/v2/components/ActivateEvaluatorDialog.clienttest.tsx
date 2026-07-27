import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  costEstimate: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: (props: { testRunCostUsd: number | null }) => {
    mocks.costEstimate(props);
    return (
      <div>
        Estimated daily cost
        <span data-testid="test-run-cost">{props.testRunCostUsd}</span>
      </div>
    );
  },
}));

import { ActivateEvaluatorDialog } from "./ActivateEvaluatorDialog";

const setupFilter = [
  {
    column: "environment",
    type: "stringOptions" as const,
    operator: "any of" as const,
    value: ["production"],
  },
];

function renderDialog(
  onOpenChange = vi.fn(),
  onComplete = vi.fn(),
  onCreateRule = vi.fn(),
) {
  render(
    <ActivateEvaluatorDialog
      projectId="project-1"
      evaluatorId="evaluator-1"
      setupFilter={setupFilter}
      setupSampling={0.5}
      testRunCostUsd={0.002}
      isCodeEvaluator={false}
      open
      onOpenChange={onOpenChange}
      onComplete={onComplete}
      onCreateRule={onCreateRule}
    />,
  );
  return { onOpenChange, onComplete, onCreateRule };
}

describe("ActivateEvaluatorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the saved evaluator disabled when Not now is chosen", () => {
    const { onOpenChange, onComplete } = renderDialog();

    expect(
      screen.getByText("Evaluator saved successfully"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your evaluator is ready. Would you like to run it automatically on incoming production observations?",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Configured filters")).not.toBeInTheDocument();
    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();
    expect(mocks.costEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: setupFilter,
        sampling: 0.5,
        testRunCostUsd: 0.002,
        enabled: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("continues to the prefilled rule dialog", () => {
    const { onOpenChange, onComplete, onCreateRule } = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Set up production rule" }),
    );

    expect(onCreateRule).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
