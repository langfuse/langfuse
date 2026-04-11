import { render, screen, within } from "@testing-library/react";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function getPromptSimulationElements() {
  const simulationPane = screen.getByTestId(
    "spielwiese-prompt-simulation-pane",
  );
  const header = within(simulationPane).getByTestId(
    "spielwiese-playground-header",
  );
  const historyButton = within(header).getByTestId(
    "spielwiese-playground-history-button",
  );
  const title = within(simulationPane).getByTestId(
    "spielwiese-playground-title",
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
  const flowSteps = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-step",
  );

  return {
    chevrons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-chevron",
    ),
    flowNodes,
    flowSteps,
    flowStrip,
    header,
    historyButton,
    simulationPane,
    terminalShell,
    title,
    userIcons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-user-icon",
    ),
  };
}

function expectPromptSimulationPaneChrome(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const { flowNodes, flowSteps, flowStrip, simulationPane, terminalShell } =
    elements;

  expect(simulationPane.className).toContain("bg-[#15181C]");
  expect(simulationPane.className).toContain("p-2");
  expect(simulationPane.className).not.toContain("border-x");
  expect(simulationPane.className).not.toContain("border-b");
  expect(terminalShell.className).toContain("rounded-[8px]");
  expect(terminalShell.className).toContain("bg-background");
  expect(terminalShell.className).toContain("flex-col");
  expect(terminalShell.className).toContain("items-start");
  expect(terminalShell.className).toContain("gap-3");
  expect(elements.header.className).toContain("ml-[13px]");
  expect(elements.header.className).toContain("gap-2");
  expect(elements.title.textContent).toBe("Playground");
  expect(elements.title.className).toContain("text-[0.75rem]");
  expect(elements.historyButton.textContent).toContain("History");
  expect(elements.historyButton.className).toContain("h-6");
  expect(elements.historyButton.className).toContain("rounded-[8px]");
  expect(elements.historyButton.className).toContain("ring-1");
  expect(elements.historyButton.querySelector("svg")).not.toBeNull();
  expect(flowStrip.className).toContain("items-start");
  expect(flowStrip.className).toContain("w-full");
  expect(simulationPane.textContent).not.toContain("Sample message");
  expect(simulationPane.textContent).not.toContain("Preview");
  expect(screen.queryByLabelText("Playground input")).toBeNull();
  expect(flowSteps).toHaveLength(3);
  expect(flowNodes).toHaveLength(3);
  expect(elements.chevrons).toHaveLength(2);
  expect(elements.userIcons).toHaveLength(3);
}

function expectPromptSimulationNodeShells(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowNode = elements.flowNodes[0]!;
  const secondFlowNode = elements.flowNodes[1]!;
  const thirdFlowNode = elements.flowNodes[2]!;
  const firstFlowStep = elements.flowSteps[0]!;
  const firstUserIcon = elements.userIcons[0]!;
  const secondUserIcon = elements.userIcons[1]!;

  expect(firstFlowStep.className).toContain("[--node-shell-gap:2px]");
  expect(firstFlowStep.className).toContain("[--node-shell-radius:16px]");
  expect(firstFlowStep.className).toContain("flex-1");
  expect(firstFlowStep.className).not.toContain("w-fit");
  expect(firstFlowStep.className).toContain("bg-[#FBFBFB]");
  expect(firstFlowStep.className).toContain("px-[2px]");
  expect(firstFlowStep.className).toContain("pt-[2px]");
  expect(firstFlowStep.className).toContain("pb-[2px]");
  expect(firstFlowNode.contains(firstUserIcon)).toBe(true);
  expect(secondFlowNode.contains(secondUserIcon)).toBe(true);
  expect(firstFlowNode.firstElementChild).toBe(firstUserIcon);
  expect(secondFlowNode.firstElementChild).toBe(secondUserIcon);
  expect(firstFlowNode.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(firstFlowNode.className).toContain("border-border/40");
  expect(firstFlowNode.className).toContain("bg-background/96");
  expect(firstFlowNode.className).toContain("w-full");
  expect(firstFlowNode.className).toContain("px-2.5");
  expect(firstFlowNode.className).toContain("py-2");
  expect(firstFlowNode.textContent).toContain("Vision Agent");
  expect(secondFlowNode.textContent).toContain("Nutrition Agent");
  expect(thirdFlowNode.textContent).toContain("Coach Agent");
}

describe("SpielwiesePromptSimulationPane", () => {
  it("renders the present nodes as a flow strip with chevrons between them", () => {
    render(
      <SpielwiesePromptSimulationPane
        nodes={spielwieseEditorCanvasTestCanvas.agentNodes}
      />,
    );

    const elements = getPromptSimulationElements();

    expectPromptSimulationPaneChrome(elements);
    expectPromptSimulationNodeShells(elements);
  });
});
