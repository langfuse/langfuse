import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  costEstimate: vi.fn(),
}));

vi.mock("@/src/features/evals/v2/components/ActivationCostEstimate", () => ({
  ActivationCostEstimate: (props: unknown) => {
    mocks.costEstimate(props);
    return <div>Estimated daily cost</div>;
  },
}));

import {
  ConfirmEvaluationRuleAttachmentDialog,
  ConfirmEvaluationRuleDetachmentDialog,
} from "./EvaluatorEditRuleDialogs";

const rule = {
  name: "Production traces",
  filter: [
    {
      column: "environment",
      type: "stringOptions" as const,
      operator: "any of" as const,
      value: ["production"],
    },
  ],
  sampling: 0.25,
};

describe("evaluator edit rule confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the rule cost before attaching immediately", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmEvaluationRuleAttachmentDialog
        projectId="project-1"
        evaluatorId="evaluator-1"
        rule={rule}
        isCodeEvaluator={false}
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByText(
        "Do you want this evaluator to run on incoming traces matched by “Production traces”?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Estimated daily cost")).toBeInTheDocument();
    expect(mocks.costEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        filter: rule.filter,
        sampling: 0.25,
        testRunCostUsd: null,
        enabled: true,
      }),
    );
    expect(
      screen.queryByText(/attached when you save the evaluator/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Attach evaluator" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("requires confirmation before detaching immediately", () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmEvaluationRuleDetachmentDialog
        rule={rule}
        isOnlyAttachedRule
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByText(
        "The evaluator will stop running on incoming traces matched by “Production traces”. Since this is its only evaluation rule, the evaluator will become inactive. The evaluation rule itself will not be deleted.",
      ),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Detach evaluator" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
