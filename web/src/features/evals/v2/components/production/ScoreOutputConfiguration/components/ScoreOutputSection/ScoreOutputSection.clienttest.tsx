import { render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ScoreOutputSection } from "./ScoreOutputSection";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/toScoreOutputFormState";

describe("ScoreOutputSection", () => {
  it("defaults new numeric scores to a zero-to-one range", () => {
    expect(toScoreOutputFormState(null)).toMatchObject({
      dataType: ScoreDataTypeEnum.NUMERIC,
      minValue: "0",
      maxValue: "1",
    });
  });

  it("prevents selector changes in read-only mode", () => {
    const onChange = vi.fn();

    render(
      <TooltipProvider>
        <ScoreOutputSection
          state={{
            dataType: ScoreDataTypeEnum.NUMERIC,
            choices: [],
            minValue: "0",
            maxValue: "1",
          }}
          onChange={onChange}
          readOnly
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Score type" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "between 0 and 1" }),
    ).toBeDisabled();

    expect(onChange).not.toHaveBeenCalled();
  });
});
