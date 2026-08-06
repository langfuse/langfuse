import { fireEvent, render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ScoreOutputDescriptionFields } from "./ScoreOutputDescriptionFields";

describe("ScoreOutputDescriptionFields", () => {
  it("reveals fixed placeholders behind Advanced and lets the user override them", () => {
    const onScoreDescriptionChange = vi.fn();
    const onReasoningDescriptionChange = vi.fn();

    render(
      <TooltipProvider>
        <ScoreOutputDescriptionFields
          scoreDescription=""
          reasoningDescription=""
          onScoreDescriptionChange={onScoreDescriptionChange}
          onReasoningDescriptionChange={onReasoningDescriptionChange}
          disabled={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByPlaceholderText("Describe what the score represents"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    fireEvent.change(
      screen.getByPlaceholderText("Describe what the score represents"),
      { target: { value: "Measures factual accuracy" } },
    );

    expect(onScoreDescriptionChange).toHaveBeenCalledWith(
      "Measures factual accuracy",
    );
    expect(
      screen.getByPlaceholderText("Describe what the reasoning should explain"),
    ).toBeInTheDocument();
    expect(onReasoningDescriptionChange).not.toHaveBeenCalled();
  });
});
