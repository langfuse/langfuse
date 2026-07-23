import { fireEvent, render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  ScoreOutputSection,
  toScoreOutputFormState,
} from "./ScoreOutputSection";

describe("ScoreOutputSection", () => {
  it("defaults new numeric scores to a zero-to-one range", () => {
    expect(toScoreOutputFormState(null)).toMatchObject({
      dataType: ScoreDataTypeEnum.NUMERIC,
      minValue: "0",
      maxValue: "1",
    });
  });

  it("does not show numeric representations for boolean scores", () => {
    render(
      <TooltipProvider>
        <ScoreOutputSection
          state={{
            dataType: ScoreDataTypeEnum.BOOLEAN,
            scoreDescription: "",
            reasoningDescription: "",
            choices: [],
            minValue: "",
            maxValue: "",
          }}
          onChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.queryByText("· 1")).not.toBeInTheDocument();
    expect(screen.queryByText("· 0")).not.toBeInTheDocument();
  });

  it("keeps the edit hierarchy while preventing changes in read-only mode", () => {
    const onChange = vi.fn();

    render(
      <TooltipProvider>
        <ScoreOutputSection
          state={{
            dataType: ScoreDataTypeEnum.NUMERIC,
            scoreDescription: "",
            reasoningDescription: "",
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

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    const descriptions = screen.getAllByRole("textbox");
    expect(descriptions).toHaveLength(2);
    descriptions.forEach((description) => {
      expect(description).toBeDisabled();
      expect(description).not.toHaveAttribute("placeholder", "");
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
