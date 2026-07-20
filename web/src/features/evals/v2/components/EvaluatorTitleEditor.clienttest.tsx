import { fireEvent, render, screen } from "@testing-library/react";

import { EvaluatorTitleEditor } from "./EvaluatorTitleEditor";

describe("EvaluatorTitleEditor", () => {
  it("edits the name inline and focuses it from the pen button", () => {
    const onScoreNameChange = vi.fn();
    render(
      <EvaluatorTitleEditor
        scoreName="helpfulness"
        onScoreNameChange={onScoreNameChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Evaluator name" });
    fireEvent.change(input, { target: { value: "correctness" } });
    expect(onScoreNameChange).toHaveBeenCalledWith("correctness");

    fireEvent.blur(input);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit evaluator name" }),
    );
    expect(input).toHaveFocus();
  });
});
