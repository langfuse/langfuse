import { render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ScoreOutputSection } from "./ScoreOutputSection";

describe("ScoreOutputSection", () => {
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
