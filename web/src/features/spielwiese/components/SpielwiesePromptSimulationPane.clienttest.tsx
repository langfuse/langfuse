import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

describe("SpielwiesePromptSimulationPane", () => {
  it("renders as a terminal-style single input line", () => {
    render(
      <SpielwiesePromptSimulationPane
        nodes={spielwieseEditorCanvasTestCanvas.agentNodes}
      />,
    );

    const simulationPane = screen.getByTestId(
      "spielwiese-prompt-simulation-pane",
    );
    const terminalShell = within(simulationPane).getByTestId(
      "spielwiese-playground-terminal-shell",
    );
    const terminalLine = within(simulationPane).getByTestId(
      "spielwiese-playground-terminal-line",
    );
    const playgroundInput = within(terminalLine).getByLabelText(
      "Playground input",
    ) as HTMLInputElement;

    expect(simulationPane.className).toContain("bg-[#F5F5F5]");
    expect(simulationPane.className).toContain("p-2");
    expect(terminalShell.className).toContain("rounded-[8px]");
    expect(terminalShell.className).toContain("bg-background");
    expect(simulationPane.textContent).not.toContain("Playground");
    expect(simulationPane.textContent).not.toContain("Sample message");
    expect(simulationPane.textContent).not.toContain("Preview");
    expect(terminalLine.textContent).toContain(">");
    expect(playgroundInput.value).toBe(
      "attached photo notes: grilled salmon lunch, rice on the side, natural light",
    );
  });

  it("keeps the terminal input editable", () => {
    render(
      <SpielwiesePromptSimulationPane
        nodes={spielwieseEditorCanvasTestCanvas.agentNodes}
      />,
    );

    const playgroundInput = screen.getByLabelText(
      "Playground input",
    ) as HTMLInputElement;

    fireEvent.change(playgroundInput, {
      target: { value: "tell me if this lunch fits my macros" },
    });

    expect(playgroundInput.value).toBe("tell me if this lunch fits my macros");
  });
});
