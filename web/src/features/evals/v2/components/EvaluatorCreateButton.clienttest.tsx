import { fireEvent, render, screen } from "@testing-library/react";

import { EvaluatorCreateButton } from "@/src/features/evals/v2/components/EvaluatorCreateButton";

describe("EvaluatorCreateButton", () => {
  it("opens the template gallery directly", () => {
    const onStartFromTemplate = vi.fn();

    render(
      <EvaluatorCreateButton
        hasWriteAccess
        onStartFromTemplate={onStartFromTemplate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New evaluator" }));
    expect(onStartFromTemplate).toHaveBeenCalledOnce();
  });
});
