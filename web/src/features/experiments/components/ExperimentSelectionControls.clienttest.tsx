import { render, screen } from "@testing-library/react";
import { ExperimentSelectionControls } from "./ExperimentSelectionControls";

vi.mock("./ExperimentBaselineControls", () => ({
  ExperimentBaselineControls: () => <div>Baseline control</div>,
}));

vi.mock("./ExperimentComparisonSelector", () => ({
  ExperimentComparisonSelector: () => <div>Experiment control</div>,
}));

describe("ExperimentSelectionControls", () => {
  it("renders equally sized baseline and experiment controls", () => {
    render(
      <ExperimentSelectionControls
        projectId="project-id"
        comparisonIds={[]}
        onBaselineChange={vi.fn()}
        onBaselineClear={vi.fn()}
        onComparisonIdsChange={vi.fn()}
      />,
    );

    const baselineContainer = screen.getByText("Baseline").parentElement;
    const experimentContainer = screen.getByText(
      "Experiment selection",
    ).parentElement;

    expect(baselineContainer).toHaveClass("w-56");
    expect(experimentContainer).toHaveClass("w-56");
  });
});
