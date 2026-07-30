import { fireEvent, render, screen } from "@testing-library/react";
import { ExperimentSelectionControls } from "./ExperimentSelectionControls";

vi.mock("./ExperimentBaselineControls", () => ({
  ExperimentBaselineControls: ({
    baselineId,
    onBaselineClear,
    canClearBaseline = true,
  }: {
    baselineId?: string;
    onBaselineClear: () => void;
    canClearBaseline?: boolean;
  }) => (
    <div>
      Baseline control
      {baselineId && canClearBaseline && (
        <button type="button" onClick={onBaselineClear}>
          Clear baseline
        </button>
      )}
    </div>
  ),
}));

vi.mock("./ExperimentComparisonSelector", () => ({
  ExperimentComparisonSelector: () => <div>Experiment control</div>,
}));

describe("ExperimentSelectionControls", () => {
  it("renders integrated baseline and experiment controls", () => {
    render(
      <ExperimentSelectionControls
        projectId="project-id"
        comparisonIds={[]}
        onBaselineChange={vi.fn()}
        onBaselineClear={vi.fn()}
        onComparisonIdsChange={vi.fn()}
      />,
    );

    const baselineLabel = screen.getByText("Baseline");
    const experimentLabel = screen.getByText("Experiment selection");
    const controls = baselineLabel.parentElement?.parentElement;

    expect(controls).toHaveClass("w-[50dvw]", "flex-row", "gap-3");
    expect(baselineLabel).toHaveClass("w-auto", "border");
    expect(experimentLabel).toHaveClass("w-auto", "border");
  });

  it("allows clearing a baseline without selected comparisons", () => {
    const onBaselineClear = vi.fn();

    render(
      <ExperimentSelectionControls
        projectId="project-id"
        baselineId="baseline-id"
        comparisonIds={[]}
        onBaselineChange={vi.fn()}
        onBaselineClear={onBaselineClear}
        onComparisonIdsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear baseline" }));

    expect(onBaselineClear).toHaveBeenCalledOnce();
  });
});
