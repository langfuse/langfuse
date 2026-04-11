/* eslint-disable max-lines-per-function */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwiesePromptSimulationPane } from "./SpielwiesePromptSimulationPane";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function getPromptSimulationElements() {
  const simulationPane = screen.getByTestId(
    "spielwiese-prompt-simulation-pane",
  );
  const header = within(simulationPane).getByTestId(
    "spielwiese-playground-header",
  );
  const actions = within(header).getByTestId("spielwiese-playground-actions");
  const historyButton = within(header).getByTestId(
    "spielwiese-playground-history-button",
  );
  const playButton = within(header).getByTestId(
    "spielwiese-playground-play-button",
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
  const thinkingCardShells = within(flowStrip).getAllByTestId(
    "spielwiese-playground-thinking-card-shell",
  );
  const flowHeaderRows = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-header-row",
  );
  const modelSegments = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-model-segment",
  );
  const titleSurfaces = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-title-surface",
  );
  const flowSteps = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-step",
  );

  return {
    chevrons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-chevron",
    ),
    actions,
    flowHeaderRows,
    flowNodes,
    flowSteps,
    flowStrip,
    header,
    historyButton,
    modelSegments,
    playButton,
    simulationPane,
    terminalShell,
    thinkingCardShells,
    title,
    titleSurfaces,
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
  expect(elements.header.className).toContain("w-full");
  expect(elements.header.className).toContain("pl-[13px]");
  expect(elements.actions.className).toContain("ml-auto");
  expect(elements.actions.className).toContain("gap-2");
  expect(elements.title.textContent).toBe("Playground");
  expect(elements.title.className).toContain("text-[0.75rem]");
  expect(elements.historyButton.textContent).toContain("History");
  expect(elements.historyButton.className).toContain("h-6");
  expect(elements.historyButton.className).toContain("rounded-[8px]");
  expect(elements.historyButton.className).toContain("ring-1");
  expect(elements.historyButton.querySelector("svg")).not.toBeNull();
  expect(elements.playButton.textContent).toContain("Play");
  expect(elements.playButton.className).toContain("h-6");
  expect(elements.playButton.className).toContain("rounded-[8px]");
  expect(elements.playButton.className).toContain("ring-1");
  expect(elements.playButton.getAttribute("aria-pressed")).toBe("false");
  expect(elements.playButton.querySelector("svg")).not.toBeNull();
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
  const firstFlowHeaderRow = elements.flowHeaderRows[0]!;
  const firstFlowStep = elements.flowSteps[0]!;
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;
  const firstUserIcon = elements.userIcons[0]!;
  const secondUserIcon = elements.userIcons[1]!;
  const firstModelSegment = elements.modelSegments[0]!;
  const firstTitleSurface = elements.titleSurfaces[0]!;

  expect(firstFlowStep.className).toContain("[--node-shell-gap:2px]");
  expect(firstFlowStep.className).toContain("[--node-shell-radius:16px]");
  expect(firstFlowStep.className).toContain("inline-flex");
  expect(firstFlowStep.className).toContain("shrink-0");
  expect(firstFlowStep.className).not.toContain("w-full");
  expect(firstFlowStep.className).not.toContain("flex-1");
  expect(firstFlowStep.className).toContain("bg-[#FBFBFB]");
  expect(firstFlowStep.className).toContain("items-center");
  expect(firstFlowStep.className).toContain("px-[2px]");
  expect(firstFlowStep.className).toContain("pt-[2px]");
  expect(firstFlowStep.className).toContain("pb-[2px]");
  expect(firstFlowStep.firstElementChild).toBe(firstFlowNode);
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("closed");
  expect(firstFlowNode.contains(firstUserIcon)).toBe(true);
  expect(secondFlowNode.contains(secondUserIcon)).toBe(true);
  expect(firstFlowNode.className).toContain("border-border/40");
  expect(firstFlowNode.className).toContain("bg-background/96");
  expect(firstFlowNode.className).toContain("inline-flex");
  expect(firstFlowNode.className).toContain("shrink-0");
  expect(firstFlowNode.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(firstFlowHeaderRow.className).toContain("inline-flex");
  expect(firstFlowHeaderRow.className).toContain("pr-[6px]");
  expect(firstFlowHeaderRow.className).toContain("pl-[6px]");
  expect(
    firstFlowHeaderRow.querySelector("[aria-label*='Minimize']"),
  ).toBeNull();
  expect(firstTitleSurface).toBe(firstModelSegment.parentElement);
  expect(firstTitleSurface.className).toContain("h-7");
  expect(firstTitleSurface.className).toContain("rounded-[10px]");
  expect(firstTitleSurface.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(firstTitleSurface.className).toContain("ring-1");
  expect(firstTitleSurface.className).toContain(
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
  );
  expect(firstTitleSurface.className).toContain("min-w-[15rem]");
  expect(firstTitleSurface.className).toContain(
    "rgba(16,163,127,0.18)_0%,rgba(16,163,127,0.08)_32%",
  );
  expect(firstModelSegment.textContent).toContain("GPT-4.1 mini");
  expect(firstFlowNode.textContent).toContain("Vision Agent");
  expect(secondFlowNode.textContent).toContain("Nutrition Agent");
  expect(thirdFlowNode.textContent).toContain("Coach Agent");
}

function expectPlaygroundThinkingState(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowStep = elements.flowSteps[0]!;
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;

  fireEvent.click(elements.playButton);

  expect(elements.playButton.getAttribute("aria-pressed")).toBe("true");
  expect(elements.playButton.className).toContain(
    "bg-[rgba(250,245,241,0.96)]",
  );
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("open");
  expect(
    within(firstThinkingCardShell).getByTestId(
      "spielwiese-playground-thinking-card",
    ),
  ).toBeTruthy();
  expect(
    within(firstThinkingCardShell).getByTestId(
      "spielwiese-playground-thinking-card-glow",
    ).className,
  ).toContain("animate-[rainbow_2.8s_linear_infinite]");
  expect(
    within(firstThinkingCardShell).getByTestId(
      "spielwiese-playground-thinking-card-dots",
    ),
  ).toBeTruthy();
  expect(firstFlowStep.textContent).toContain("Thinking");
  expect(firstFlowStep.textContent).toContain("analyzing prompt");
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
    expectPlaygroundThinkingState(elements);
  });
});
