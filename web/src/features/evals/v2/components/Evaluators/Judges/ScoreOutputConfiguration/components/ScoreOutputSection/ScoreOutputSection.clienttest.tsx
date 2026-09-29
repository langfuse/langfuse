import { render, screen } from "@testing-library/react";
import { ScoreDataTypeEnum } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ScoreOutputSection } from "./ScoreOutputSection";

describe("ScoreOutputSection", () => {
  it("marks empty category placeholders with the blocking reason", () => {
    render(
      <TooltipProvider>
        <ScoreOutputSection
          state={{
            dataType: ScoreDataTypeEnum.CATEGORICAL,
            choices: [{ label: "" }, { label: "" }],
            shouldAllowMultipleMatches: false,
            minValue: "",
            maxValue: "",
          }}
          onChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getAllByLabelText("Warning: Category names cannot be empty."),
    ).toHaveLength(2);
  });
});
