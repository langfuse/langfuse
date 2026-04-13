import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseEvaluationPane } from "./SpielwieseEvaluationPane";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderEvaluationPane() {
  return render(
    <SpielwieseEvaluationPane
      nodes={spielwieseEditorCanvasTestCanvas.agentNodes}
    />,
  );
}

function expectStrategyFieldLabels({
  label,
  strategyId,
  selectLabels,
}: {
  label: string;
  selectLabels: string[];
  strategyId: string;
}) {
  fireEvent.click(
    screen.getByTestId(`spielwiese-evaluation-strategy-${strategyId}`),
  );
  expect(screen.getByLabelText(label)).toBeTruthy();
  selectLabels.forEach((selectLabel) => {
    expect(screen.getByRole("combobox", { name: selectLabel })).toBeTruthy();
  });
}

describe("SpielwieseEvaluationPane", () => {
  it("asks for the right inputs for each evaluation strategy", () => {
    renderEvaluationPane();

    expect(screen.getByLabelText("Judge prompt")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Output score type" }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-evaluation-variable-chip-output"),
    ).toBeTruthy();
    expectStrategyFieldLabels({
      label: "JavaScript evaluator code",
      selectLabels: [],
      strategyId: "javascript",
    });
    expectStrategyFieldLabels({
      label: "Cost threshold",
      selectLabels: ["Cost comparator", "Cost threshold unit"],
      strategyId: "cost",
    });
    expectStrategyFieldLabels({
      label: "Latency threshold",
      selectLabels: ["Latency comparator", "Latency threshold unit"],
      strategyId: "latency",
    });
    expectStrategyFieldLabels({
      label: "Response length threshold",
      selectLabels: ["Response length comparator", "Response length unit"],
      strategyId: "response-length",
    });
    expectStrategyFieldLabels({
      label: "Text matcher value",
      selectLabels: ["Text matcher operator"],
      strategyId: "text-matcher",
    });
  });

  it("keeps the bottom inset outside the scrolling surface", () => {
    renderEvaluationPane();

    const frame = screen.getByTestId("spielwiese-evaluation-pane-frame");
    const surface = screen.getByTestId("spielwiese-evaluation-pane-surface");
    const bottomInset = screen.getByTestId(
      "spielwiese-evaluation-pane-bottom-inset",
    );

    expect(frame.className).toContain("relative");
    expect(frame.className).toContain("overflow-hidden");
    expect(surface.className).toContain("overflow-y-auto");
    expect(surface.className).not.toContain("after:h-[6px]");
    expect(frame.contains(surface)).toBe(true);
    expect(frame.contains(bottomInset)).toBe(true);
    expect(surface.contains(bottomInset)).toBe(false);
  });
});
