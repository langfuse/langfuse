import { fireEvent, render, screen } from "@testing-library/react";

import { ConfirmEvaluationRuleDetachmentDialog } from "./EvaluatorEditRuleDialogs";

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
