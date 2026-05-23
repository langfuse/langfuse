/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  const terminalSurface = within(simulationPane).getByTestId(
    "spielwiese-playground-terminal-surface",
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
  const tagStrips = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-node-tag-strip",
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
    flowActionGroups: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-node-actions",
    ),
    flowHeaderRows,
    flowNodes,
    flowScroller,
    flowSteps,
    flowStrip,
    header,
    historyButton,
    nodeTags: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-node-tag",
    ),
    playButton,
    previewRows,
    previewShells,
    simulationPane,
    tagStrips,
    terminalShell,
    terminalSurface,
    thinkingCardShells,
    title,
    userIcons: within(flowStrip).getAllByTestId(
      "spielwiese-playground-flow-user-icon",
    ),
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
    terminalSurface,
  } = elements;

  expect(simulationPane.className).toContain("bg-[#F3F3F4]");
  expect(simulationPane.className).toContain("px-0");
  expect(simulationPane.className).toContain("pt-0.5");
  expect(simulationPane.className).toContain("pb-0");
  expect(simulationPane.className).not.toContain("pt-2");
  expect(simulationPane.className).not.toContain("px-2");
  expect(simulationPane.className).toContain("overflow-hidden");
  expect(simulationPane.className).not.toContain("border-x");
  expect(simulationPane.className).not.toContain("border-b");
  expect(terminalShell.className).toContain(
    "[--canvas-pane-inner-radius:18px]",
  );
  expect(terminalShell.className).toContain("[--canvas-pane-shell-gap:2px]");
  expect(terminalShell.className).toContain(
    "[--canvas-pane-outer-radius:calc(var(--canvas-pane-inner-radius)+var(--canvas-pane-shell-gap))]",
  );
  expect(terminalShell.className).toContain(
    "rounded-[var(--canvas-pane-outer-radius)]",
  );
  expect(terminalShell.className).toContain("border");
  expect(terminalShell.className).toContain("border-black/10");
  expect(terminalShell.className).toContain("bg-[#F3F3F4]");
  expect(terminalShell.className).toContain("w-full");
  expect(terminalShell.className).toContain("min-w-0");
  expect(terminalShell.className).toContain("flex-1");
  expect(terminalShell.className).toContain("flex-col");
  expect(terminalShell.className).toContain("p-[var(--canvas-pane-shell-gap)]");
  expect(terminalSurface.className).toContain("bg-background");
  expect(terminalSurface.className).toContain(
    "rounded-[var(--canvas-pane-inner-radius)]",
  );
  expect(terminalSurface.className).toContain("relative");
  expect(terminalSurface.className).toContain("px-2.5");
  expect(terminalSurface.className).toContain("pt-0");
  expect(terminalSurface.className).toContain("pb-0");
  expect(terminalSurface.className).not.toContain("pb-[6px]");
  expect(terminalSurface.className).not.toContain("after:h-[6px]");
  expect(terminalSurface.className).not.toContain("after:bg-[#F3F3F4]");
  expect(elements.header.className).toContain("sticky");
  expect(elements.header.className).toContain("-mx-2.5");
  expect(elements.header.className).toContain("w-[calc(100%+1.25rem)]");
  expect(elements.header.className).toContain("gap-2");
  expect(elements.header.className).toContain("pt-2");
  expect(elements.header.className).toContain("pb-2");
  expect(elements.header.className).toContain("px-2");
  expect(elements.header.className).toContain(
    "rounded-t-[var(--canvas-pane-inner-radius)]",
  );
  expect(elements.header.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(elements.header.className).toContain("backdrop-blur");
  expect(elements.actions.className).toContain("ml-auto");
  expect(elements.actions.className).toContain("gap-2");
  expect(elements.title).toBeNull();
  expect(elements.historyButton.textContent).toContain("History");
  expect(elements.historyButton.getAttribute("aria-disabled")).toBe("true");
  expect(elements.historyButton.getAttribute("tabindex")).toBe("-1");
  expect(elements.historyButton.className).toContain("h-6");
  expect(elements.historyButton.className).toContain("rounded-[10px]");
  expect(elements.historyButton.className).toContain("pointer-events-none");
  expect(elements.historyButton.className).toContain("cursor-default");
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
  expect(elements.flowActionGroups).toHaveLength(3);
  expect(elements.nodeTags).toHaveLength(6);
  expect(elements.tagStrips).toHaveLength(3);
  expect(elements.userIcons).toHaveLength(3);
  expect(
    flowStrip.querySelectorAll('[data-testid^="spielwiese-provider-mark-"]'),
  ).toHaveLength(3);
  expect(
    within(flowStrip).getAllByRole("button", { name: /Preview .* node/i }),
  ).toHaveLength(3);
}

function expectPromptSimulationNodeShells(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowNode = elements.flowNodes[0]!;
  const secondFlowNode = elements.flowNodes[1]!;
  const thirdFlowNode = elements.flowNodes[2]!;
  const firstCardFrame = elements.cardFrames[0]!;
  const firstFlowHeaderRow = elements.flowHeaderRows[0]!;
  const firstTagStrip = elements.tagStrips[0]!;
  const firstFlowStep = elements.flowSteps[0]!;
  const [firstUserTag, firstAgentTag] = within(firstTagStrip).getAllByTestId(
    "spielwiese-playground-flow-node-tag",
  );
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;
  const firstPreviewShell = elements.previewShells[0]!;
  const firstPreviewRow = elements.previewRows[0]!;
  const firstPreviewBody = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-body",
  );
  const firstPreviewEmbeddedHeader = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-embedded-header",
  );
  const firstPreviewLabelGroup = within(firstPreviewEmbeddedHeader).getByTestId(
    "spielwiese-playground-flow-preview-label-group",
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
  expect(firstFlowStep.className).toContain(
    "border-[color:var(--spielwiese-agent-node-shell-border)]",
  );
  expect(firstFlowStep.className).toContain(
    "bg-[var(--spielwiese-agent-node-shell-surface)]",
  );
  expect(firstFlowStep.className).toContain("gap-0.5");
  expect(firstFlowStep.className).toContain("shadow-none");
  expect(firstFlowStep.firstElementChild).toBe(firstCardFrame);
  expect(firstCardFrame.className).toContain(
    "rounded-[var(--node-shell-radius)]",
  );
  expect(firstCardFrame.className).toContain(
    "bg-[var(--spielwiese-agent-node-shell-surface)]",
  );
  expect(firstCardFrame.className).toContain("p-0.5");
  expect(firstCardFrame.className).not.toContain("-mb-0.5");
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("closed");
  expect(firstFlowNode.contains(firstUserTag!)).toBe(true);
  expect(firstFlowNode.contains(firstAgentTag!)).toBe(true);
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
  expectPromptSimulationHeaderTags({
    firstAgentTag: firstAgentTag!,
    firstFlowHeaderRow,
    firstTagStrip,
    firstUserTag: firstUserTag!,
  });
  expect(firstPreviewShell.className).toContain("px-[5px]");
  expect(firstPreviewShell.className).toContain("w-full");
  expect(firstPreviewShell.className).toContain("min-w-0");
  expect(firstPreviewRow.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(firstPreviewRow.className).toContain("bg-background/96");
  expect(firstPreviewRow.className).toContain("border-border/40");
  expect(firstPreviewRow.className).not.toContain("px-[5px]");
  expect(firstPreviewRow.className).toContain("pt-0");
  expect(firstPreviewRow.className).toContain("pb-0");
  expect(firstPreviewRow.getAttribute("data-section-id")).toBe("system");
  expect(firstPreviewBody.className).toContain("pt-0");
  expect(firstPreviewBody.className).toContain("pb-px");
  expect(firstPreviewEmbeddedHeader.className).toContain("ml-[2px]");
  expect(firstPreviewFieldShell.className).toContain(
    "bg-[var(--spielwiese-agent-node-prompt-frame-surface)]",
  );
  expect(firstPreviewFieldShell.className).toContain("flex-col");
  expect(firstPreviewFieldShell.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(firstPreviewFieldShell.className).toContain("px-[2px]");
  expect(firstPreviewFieldShell.className).toContain("pb-[2px]");
  expect(firstPreviewValueShell?.className).toContain(
    "bg-[var(--spielwiese-agent-node-prompt-value-surface)]",
  );
  expect(firstPreviewValueShell?.className).toContain(
    "shadow-[inset_0_0_0_1px_var(--spielwiese-agent-node-prompt-value-border)]",
  );
  expect(firstPreviewValue.className).toContain("bg-transparent");
  expect(firstPreviewValue.className).toContain("font-mono");
  expect(firstPreviewValue.className).toContain("whitespace-pre-wrap");
  expect(firstPreviewLabelGroup.className).toContain(
    "pt-[var(--spielwiese-message-section-chip-padding-top)]",
  );
  expect(firstPreviewLabelGroup.className).toContain(
    "pr-[var(--spielwiese-message-section-chip-padding-right)]",
  );
  expect(firstPreviewLabelGroup.className).toContain(
    "pb-[var(--spielwiese-message-section-chip-padding-bottom)]",
  );
  expect(firstPreviewLabelGroup.className).toContain(
    "pl-[var(--spielwiese-message-section-chip-padding-left)]",
  );
  expect(
    firstPreviewLabelGroup.querySelector("svg")?.getAttribute("class"),
  ).toContain("lucide-bot");
  expect(firstPreviewRow.textContent).toContain("Answer");
  expect(firstPreviewValue.textContent).toContain('"item": "grilled salmon"');
  expect(firstPreviewValue.textContent).toContain('"estimated_weight_g": 186');
  expect(secondFlowNode.textContent).toContain("User");
  expect(secondFlowNode.textContent).toContain("Nutrition Agent");
  expect(thirdFlowNode.textContent).toContain("User");
  expect(thirdFlowNode.textContent).toContain("Coach Agent");
}

function expectPromptSimulationHeaderTags({
  firstAgentTag,
  firstFlowHeaderRow,
  firstTagStrip,
  firstUserTag,
}: {
  firstAgentTag: HTMLElement;
  firstFlowHeaderRow: HTMLElement;
  firstTagStrip: HTMLElement;
  firstUserTag: HTMLElement;
}) {
  expect(firstFlowHeaderRow.className).toContain("flex");
  expect(firstFlowHeaderRow.className).toContain("w-full");
  expect(firstFlowHeaderRow.className).toContain("min-w-0");
  expect(firstFlowHeaderRow.className).toContain("gap-1.5");
  expect(firstFlowHeaderRow.className).toContain("pr-[6px]");
  expect(firstFlowHeaderRow.className).toContain("pl-[6px]");
  expectPromptSimulationHeaderTagStrip(firstTagStrip);
  const actionButtons = within(firstFlowHeaderRow).getByTestId(
    "spielwiese-playground-flow-node-actions",
  );
  expect(actionButtons.className).toContain("flex");
  expect(actionButtons.className).toContain("gap-1");
  const compactButton = within(actionButtons).getByRole("button", {
    name: "Minimize vision-agent node sections",
  });
  expect(
    within(actionButtons).getByRole("button", {
      name: "Preview vision-agent node",
    }),
  ).toBeTruthy();
  const archiveButton = within(actionButtons).getByRole("button", {
    name: "Archive vision-agent node",
  });
  expect(compactButton.getAttribute("aria-disabled")).toBe("true");
  expect(compactButton.getAttribute("tabindex")).toBe("-1");
  expect(compactButton.className).toContain("pointer-events-none");
  expect(archiveButton.getAttribute("aria-disabled")).toBe("true");
  expect(archiveButton.getAttribute("tabindex")).toBe("-1");
  expect(archiveButton.className).toContain("pointer-events-none");
  expect(firstUserTag.className).toContain("h-7");
  expect(firstUserTag.className).toContain("rounded-[10px]");
  expect(firstUserTag.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(firstAgentTag.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(firstAgentTag.className).toContain("ring-1");
  expect(firstAgentTag.className).toContain(
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
  );
  expect(firstAgentTag.className).toContain("max-w-full");
  expect(firstAgentTag.className).toContain("min-w-0");
  expect(firstUserTag.textContent).toContain("User");
  expect(firstAgentTag.textContent).toContain("Vision Agent");
}

function expectPromptSimulationHeaderTagStrip(firstTagStrip: HTMLElement) {
  expect(firstTagStrip.textContent).toContain("User");
  expect(firstTagStrip.textContent).toContain("Vision Agent");
  expect(
    within(firstTagStrip).getAllByTestId("spielwiese-playground-flow-node-tag"),
  ).toHaveLength(2);
  expect(
    within(firstTagStrip).getAllByTestId(
      "spielwiese-playground-flow-user-icon",
    ),
  ).toHaveLength(1);
  expect(
    firstTagStrip.querySelector(
      '[data-testid="spielwiese-provider-mark-openai"]',
    ),
  ).not.toBeNull();
}

function expectPlaygroundThinkingState(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstFlowStep = elements.flowSteps[0]!;
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;
  const firstThinkingCard = within(firstThinkingCardShell).getByTestId(
    "spielwiese-playground-thinking-card",
  );
  const firstPreviewValue = within(firstFlowStep).getByTestId(
    "spielwiese-playground-flow-preview-value",
  );

  fireEvent.click(elements.playButton);

  expect(elements.playButton.getAttribute("aria-pressed")).toBe("true");
  expect(elements.playButton.className).toContain(
    "bg-[rgba(250,245,241,0.96)]",
  );
  expect(firstPreviewValue.textContent).toBe("");
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("open");
  expect(firstThinkingCardShell.className).toContain("flex-1");
  expect(firstThinkingCardShell.className).toContain("max-w-none");
  expect(firstThinkingCard.className).toContain("w-full");
  expect(firstThinkingCard.className).not.toContain("184,139,76");
  expect(firstThinkingCard.className).not.toContain("201,120,62");
  expect(firstThinkingCard.className).not.toContain("bg-[linear-gradient");
  expect(firstThinkingCard).toBeTruthy();
  expect(
    within(firstThinkingCardShell).queryByTestId(
      "spielwiese-playground-thinking-card-glow",
    ),
  ).toBeNull();
  expect(
    within(firstThinkingCardShell).queryByTestId(
      "spielwiese-playground-thinking-card-dots",
    ),
  ).toBeNull();
  expect(
    within(firstThinkingCardShell)
      .getByTestId("spielwiese-playground-thinking-card-loader")
      .getAttribute("class"),
  ).toContain("animate-spin");
  expect(
    within(firstThinkingCard).getByTestId(
      "spielwiese-playground-thinking-stat-tools",
    ).textContent,
  ).toContain("Tools 1");
  expect(
    within(firstThinkingCard).getByTestId(
      "spielwiese-playground-thinking-stat-reasoned",
    ).textContent,
  ).toContain("Reasoned 3");
  expect(
    within(firstThinkingCard).getByTestId(
      "spielwiese-playground-thinking-stat-tokens",
    ).textContent,
  ).toContain("428 tok");
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

function getNodesWithSimulatedUserAnswer() {
  const visionNode = spielwieseEditorCanvasTestCanvas.agentNodes[0]!;

  return [
    visionNode,
    {
      ...visionNode,
      id: "vision-agent-user-answer",
      layout: "user-only" as const,
      notes: [],
      playgroundPreview: undefined,
      playgroundThinking: undefined,
      promptSections: [
        {
          id: "user",
          label: "User",
          value: "I had adana kebab with lavash and grilled peppers.",
        },
      ],
      settings: visionNode.settings.map((setting) => ({ ...setting })),
      title: visionNode.title,
    },
    ...spielwieseEditorCanvasTestCanvas.agentNodes.slice(1),
  ];
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

  it("keeps user-only nodes blank until play while still showing the agent tag in the header", () => {
    jest.useFakeTimers();

    try {
      render(
        <SpielwiesePromptSimulationPane
          nodes={getNodesWithSimulatedUserAnswer()}
        />,
      );

      const simulationPane = screen.getByTestId(
        "spielwiese-prompt-simulation-pane",
      );
      const flowNodes = within(simulationPane).getAllByTestId(
        "spielwiese-playground-flow-node",
      );
      const userOnlyNode = flowNodes[1]!;
      const userOnlyTagStrip = within(userOnlyNode).getByTestId(
        "spielwiese-playground-flow-node-tag-strip",
      );
      const playButton = within(simulationPane).getByTestId(
        "spielwiese-playground-play-button",
      );

      expect(
        within(userOnlyNode).queryByTestId(
          "spielwiese-playground-flow-preview-row",
        ),
      ).toBeNull();
      expect(userOnlyTagStrip.textContent).toContain("User");
      expect(userOnlyTagStrip.textContent).toContain("Vision Agent");
      expect(
        within(userOnlyTagStrip).getAllByTestId(
          "spielwiese-playground-flow-node-tag",
        ),
      ).toHaveLength(2);

      fireEvent.click(playButton);

      expect(playButton.getAttribute("aria-pressed")).toBe("true");
      expect(
        within(userOnlyNode).getByTestId("spielwiese-playground-thinking-card"),
      ).toBeTruthy();
      expect(userOnlyNode.textContent).toContain("drafting nutrient JSON");

      act(() => {
        jest.runAllTimers();
      });

      expect(playButton.getAttribute("aria-pressed")).toBe("false");
      expect(
        within(userOnlyNode)
          .getByTestId("spielwiese-playground-thinking-card-shell")
          .getAttribute("data-state"),
      ).toBe("closed");

      const streamedPreview = within(userOnlyNode).getByTestId(
        "spielwiese-playground-flow-preview-value",
      );

      expect(streamedPreview.textContent).toContain('"food": "adana kebab"');
      expect(streamedPreview.textContent).toContain('"protein_g": 28.4');
      expect(streamedPreview.textContent).toContain('"vitamin_b12_mcg": 2.6');
    } finally {
      jest.useRealTimers();
    }
  });
});
