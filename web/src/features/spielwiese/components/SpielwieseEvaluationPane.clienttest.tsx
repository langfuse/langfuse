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

    fireEvent.click(
      screen.getByTestId("spielwiese-evaluation-strategy-javascript"),
    );
    expect(screen.getByLabelText("JavaScript evaluator code")).toBeTruthy();

    fireEvent.click(screen.getByTestId("spielwiese-evaluation-strategy-cost"));
    expect(screen.getByLabelText("Cost threshold")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Cost comparator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Cost threshold unit" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("spielwiese-evaluation-strategy-latency"),
    );
    expect(screen.getByLabelText("Latency threshold")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Latency comparator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Latency threshold unit" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("spielwiese-evaluation-strategy-response-length"),
    );
    expect(screen.getByLabelText("Response length threshold")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Response length comparator" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Response length unit" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTestId("spielwiese-evaluation-strategy-text-matcher"),
    );
    expect(screen.getByLabelText("Text matcher value")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Text matcher operator" }),
    ).toBeTruthy();
  });
});
