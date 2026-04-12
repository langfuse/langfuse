/* eslint-disable max-lines */
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
  const title = within(simulationPane).queryByTestId(
    "spielwiese-playground-title",
  );
  const terminalShell = within(simulationPane).getByTestId(
    "spielwiese-playground-terminal-shell",
  );
  const flowStrip = within(simulationPane).getByTestId(
    "spielwiese-playground-flow-strip",
  );
  const flowScroller = within(simulationPane).getByTestId(
    "spielwiese-playground-flow-scroller",
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
  const previewRows = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-preview-row",
  );
  const previewShells = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-preview-shell",
  );
  const flowSteps = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-step",
  );
  const cardFrames = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-card-frame",
  );

  return {
    chevrons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-chevron",
    ),
    actions,
    cardFrames,
    flowHeaderRows,
    flowNodes,
    flowScroller,
    flowSteps,
    flowStrip,
    header,
    historyButton,
    nodeKindIcons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-kind-icon",
    ),
    nodeTags: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-node-tag",
    ),
    playButton,
    previewRows,
    previewShells,
    simulationPane,
    terminalShell,
    thinkingCardShells,
    title,
  };
}

function expectPromptSimulationPaneChrome(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const {
    flowNodes,
    flowScroller,
    flowSteps,
    flowStrip,
    previewRows,
    simulationPane,
    terminalShell,
  } = elements;

  expect(simulationPane.className).toContain("bg-[#F3F3F4]");
  expect(simulationPane.className).toContain("px-0");
  expect(simulationPane.className).toContain("pb-0");
  expect(simulationPane.className).not.toContain("pt-2");
  expect(simulationPane.className).not.toContain("px-2");
  expect(simulationPane.className).toContain("overflow-hidden");
  expect(simulationPane.className).not.toContain("border-x");
  expect(simulationPane.className).not.toContain("border-b");
  expect(terminalShell.className).toContain("rounded-[8px]");
  expect(terminalShell.className).not.toContain("rounded-t-[8px]");
  expect(terminalShell.className).not.toContain("rounded-b-[8px]");
  expect(terminalShell.className).toContain("bg-background");
  expect(terminalShell.className).toContain("w-full");
  expect(terminalShell.className).toContain("min-w-0");
  expect(terminalShell.className).toContain("flex-1");
  expect(terminalShell.className).toContain("flex-col");
  expect(terminalShell.className).toContain("relative");
  expect(terminalShell.className).toContain("overflow-visible");
  expect(terminalShell.className).toContain("pt-0");
  expect(terminalShell.className).toContain("pb-[6px]");
  expect(terminalShell.className).toContain("after:h-[6px]");
  expect(terminalShell.className).toContain("after:bg-[#F3F3F4]");
  expect(elements.header.className).toContain("sticky");
  expect(elements.header.className).toContain("w-[calc(100%+2rem)]");
  expect(elements.header.className).toContain("pt-3");
  expect(elements.header.className).toContain("pb-3");
  expect(elements.header.className).toContain("pl-[13px]");
  expect(elements.header.className).toContain("rounded-t-[8px]");
  expect(elements.header.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(elements.header.className).toContain("backdrop-blur");
  expect(elements.actions.className).toContain("ml-auto");
  expect(elements.actions.className).toContain("gap-2");
  expect(elements.title).toBeNull();
  expect(elements.historyButton.textContent).toContain("History");
  expect(elements.historyButton.className).toContain("h-6");
  expect(elements.historyButton.className).toContain("rounded-[10px]");
  expect(elements.historyButton.className).toContain(
    "border-[rgba(0,0,0,0.08)]",
  );
  expect(elements.historyButton.className).toContain("bg-background");
  expect(elements.historyButton.querySelector("svg")).not.toBeNull();
  expect(elements.playButton.textContent).toContain("Play");
  expect(elements.playButton.className).toContain("h-6");
  expect(elements.playButton.className).toContain("rounded-[10px]");
  expect(elements.playButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(elements.playButton.className).toContain("bg-background");
  expect(elements.playButton.getAttribute("aria-pressed")).toBe("false");
  expect(elements.playButton.querySelector("svg")).not.toBeNull();
  expect(flowScroller.className).toContain("w-full");
  expect(flowScroller.className).toContain("min-w-0");
  expect(flowScroller.className).toContain("flex-1");
  expect(flowScroller.className).toContain("overflow-y-auto");
  expect(flowScroller.className).toContain("pb-3");
  expect(flowScroller.className).not.toContain("overflow-x-auto");
  expect(
    within(simulationPane).queryByTestId(
      "spielwiese-playground-composer-shell",
    ),
  ).toBeNull();
  expect(flowStrip.className).toContain("items-start");
  expect(flowStrip.className).toContain("inline-flex");
  expect(flowStrip.className).toContain("min-w-full");
  expect(simulationPane.textContent).not.toContain("Sample message");
  expect(simulationPane.textContent).not.toContain("Preview");
  expect(flowSteps).toHaveLength(3);
  expect(flowNodes).toHaveLength(3);
  expect(previewRows).toHaveLength(3);
  expect(elements.previewShells).toHaveLength(3);
  expect(elements.chevrons).toHaveLength(2);
  expect(elements.nodeTags).toHaveLength(3);
  expect(elements.nodeKindIcons).toHaveLength(3);
  expect(
    within(flowStrip).queryByRole("button", { name: /Preview .* node/i }),
  ).toBeNull();
}

function expectPromptSimulationNodeShells(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowNode = elements.flowNodes[0]!;
  const secondFlowNode = elements.flowNodes[1]!;
  const thirdFlowNode = elements.flowNodes[2]!;
  const firstCardFrame = elements.cardFrames[0]!;
  const firstFlowHeaderRow = elements.flowHeaderRows[0]!;
  const firstFlowStep = elements.flowSteps[0]!;
  const firstNodeTag = elements.nodeTags[0]!;
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;
  const firstNodeKindIcon = elements.nodeKindIcons[0]!;
  const firstPreviewShell = elements.previewShells[0]!;
  const firstPreviewRow = elements.previewRows[0]!;
  const firstPreviewBody = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-body",
  );
  const firstPreviewEmbeddedHeader = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-embedded-header",
  );
  const firstPreviewFieldShell = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-field-shell",
  );
  const firstPreviewValue = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-value",
  );
  const firstPreviewValueShell = firstPreviewValue.parentElement;

  expect(firstFlowStep.className).toContain("[--node-shell-gap:2px]");
  expect(firstFlowStep.className).toContain("[--node-shell-radius:18px]");
  expect(firstFlowStep.className).toContain("flex");
  expect(firstFlowStep.className).toContain("flex-col");
  expect(firstFlowStep.className).toContain("min-w-full");
  expect(firstFlowStep.className).toContain("shrink-0");
  expect(firstFlowStep.className).toContain("rounded-(--node-shell-radius)");
  expect(firstFlowStep.className).toContain("border-[rgba(15,23,42,0.08)]");
  expect(firstFlowStep.className).toContain("bg-[#F1F2F2]");
  expect(firstFlowStep.className).toContain("gap-0.5");
  expect(firstFlowStep.className).toContain(
    "shadow-[0_12px_30px_rgba(15,23,42,0.04),0_2px_6px_rgba(15,23,42,0.04)]",
  );
  expect(firstFlowStep.firstElementChild).toBe(firstCardFrame);
  expect(firstCardFrame.className).toContain(
    "rounded-[var(--node-shell-radius)]",
  );
  expect(firstCardFrame.className).toContain("bg-[#F1F2F2]");
  expect(firstCardFrame.className).toContain("p-0.5");
  expect(firstCardFrame.className).not.toContain("-mb-0.5");
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("closed");
  expect(firstFlowNode.contains(firstNodeTag)).toBe(true);
  expect(firstFlowNode.contains(firstPreviewShell)).toBe(true);
  expect(firstFlowNode.className).toContain("border-border/40");
  expect(firstFlowNode.className).toContain("bg-background/96");
  expect(firstFlowNode.className).toContain("flex");
  expect(firstFlowNode.className).toContain("w-full");
  expect(firstFlowNode.className).toContain("min-w-0");
  expect(firstFlowNode.className).toContain("flex-col");
  expect(firstFlowNode.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(firstFlowNode.className).toContain("pb-[4px]");
  expect(firstFlowHeaderRow.className).toContain("flex");
  expect(firstFlowHeaderRow.className).toContain("w-full");
  expect(firstFlowHeaderRow.className).toContain("min-w-0");
  expect(firstFlowHeaderRow.className).toContain("gap-1.5");
  expect(firstFlowHeaderRow.className).toContain("pr-[6px]");
  expect(firstFlowHeaderRow.className).toContain("pl-[6px]");
  expect(
    firstFlowHeaderRow.querySelector("[aria-label*='Minimize']"),
  ).toBeNull();
  expect(firstNodeTag.className).toContain("h-7");
  expect(firstNodeTag.className).toContain("rounded-[10px]");
  expect(firstNodeTag.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(firstNodeTag.className).toContain("ring-1");
  expect(firstNodeTag.className).toContain(
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
  );
  expect(firstNodeTag.className).toContain("max-w-full");
  expect(firstNodeTag.className).toContain("min-w-0");
  expect(firstNodeKindIcon.getAttribute("class")).toContain("size-3");
  expect(firstNodeTag.textContent).toContain("Vision Agent");
  expect(firstPreviewShell.className).toContain("px-[5px]");
  expect(firstPreviewShell.className).toContain("w-full");
  expect(firstPreviewShell.className).toContain("min-w-0");
  expect(firstPreviewRow.className).toContain("rounded-xl");
  expect(firstPreviewRow.className).toContain("bg-muted/24");
  expect(firstPreviewRow.className).toContain("px-[5px]");
  expect(firstPreviewRow.className).toContain("pt-0");
  expect(firstPreviewRow.className).toContain("pb-0");
  expect(firstPreviewRow.getAttribute("data-section-id")).toBe("system");
  expect(firstPreviewBody.className).toContain("pt-0");
  expect(firstPreviewBody.className).toContain("pb-px");
  expect(firstPreviewEmbeddedHeader.className).toContain("ml-[5px]");
  expect(firstPreviewFieldShell.className).toContain("bg-[#F1F2F2]");
  expect(firstPreviewFieldShell.className).toContain("flex-col");
  expect(firstPreviewFieldShell.className).toContain(
    "border-[rgba(0,0,0,0.05)]",
  );
  expect(firstPreviewFieldShell.className).toContain("px-[2px]");
  expect(firstPreviewFieldShell.className).toContain("pb-[2px]");
  expect(firstPreviewValueShell?.className).toContain("bg-[#FBFBFB]");
  expect(firstPreviewValueShell?.className).toContain(
    "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
  );
  expect(firstPreviewValue.className).toContain("bg-transparent");
  expect(firstPreviewValue.className).toContain("font-mono");
  expect(firstPreviewValue.className).toContain("whitespace-pre-wrap");
  expect(firstPreviewRow.textContent).toContain("Answer");
  expect(firstPreviewValue.textContent).toContain('"item": "grilled salmon"');
  expect(firstPreviewValue.textContent).toContain('"estimated_weight_g": 186');
  expect(secondFlowNode.textContent).toContain("Nutrition Agent");
  expect(thirdFlowNode.textContent).toContain("Coach Agent");
}

function expectPlaygroundThinkingState(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowStep = elements.flowSteps[0]!;
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;
  const firstThinkingCard = within(firstThinkingCardShell).getByTestId(
    "spielwiese-playground-thinking-card",
  );

  fireEvent.click(elements.playButton);

  expect(elements.playButton.getAttribute("aria-pressed")).toBe("true");
  expect(elements.playButton.className).toContain(
    "bg-[rgba(250,245,241,0.96)]",
  );
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("open");
  expect(firstThinkingCardShell.className).toContain("flex-1");
  expect(firstThinkingCardShell.className).toContain("max-w-none");
  expect(firstThinkingCard.className).toContain("w-full");
  expect(firstThinkingCard).toBeTruthy();
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

  fireEvent.click(firstThinkingCard);

  expect(
    within(firstFlowStep).getByTestId("spielwiese-playground-thinking-detail"),
  ).toBeTruthy();
  expect(firstFlowStep.textContent).toContain("Vision pass");
  expect(firstFlowStep.textContent).toContain(
    "Identify distinct food candidates from the plate image.",
  );
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
