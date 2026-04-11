import { render, screen, within } from "@testing-library/react";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

describe("SpielwiesePromptSimulationPane", () => {
  it("renders the present nodes as a flow strip with chevrons between them", () => {
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
    const flowStrip = within(simulationPane).getByTestId(
      "spielwiese-playground-flow-strip",
    );
    const flowNodes = within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-node",
    );
    const chevrons = within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-chevron",
    );
    const userIcons = within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-user-icon",
    );

    expect(simulationPane.className).toContain("bg-[#F5F5F5]");
    expect(simulationPane.className).toContain("p-2");
    expect(terminalShell.className).toContain("rounded-[8px]");
    expect(terminalShell.className).toContain("bg-background");
    expect(terminalShell.className).toContain("items-center");
    expect(simulationPane.textContent).not.toContain("Playground");
    expect(simulationPane.textContent).not.toContain("Sample message");
    expect(simulationPane.textContent).not.toContain("Preview");
    expect(screen.queryByLabelText("Playground input")).toBeNull();
    expect(flowNodes).toHaveLength(3);
    expect(chevrons).toHaveLength(2);
    expect(userIcons).toHaveLength(3);
    expect(flowNodes[0]?.firstElementChild).toBe(userIcons[0]);
    expect(flowNodes[1]?.firstElementChild).toBe(userIcons[1]);
    expect(flowNodes[0]?.textContent).toContain("Vision Agent");
    expect(flowNodes[1]?.textContent).toContain("Nutrition Agent");
    expect(flowNodes[2]?.textContent).toContain("Coach Agent");
  });
});
