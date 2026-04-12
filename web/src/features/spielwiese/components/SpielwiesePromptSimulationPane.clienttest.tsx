/* eslint-disable max-lines, max-lines-per-function */
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
  const composerShell = within(simulationPane).getByTestId(
    "spielwiese-playground-composer-shell",
  );
  const composerForm = within(composerShell).getByTestId(
    "spielwiese-playground-composer-form",
  );
  const composerLeading = within(composerForm).getByTestId(
    "spielwiese-playground-composer-leading",
  );
  const composerAddButton = within(composerLeading).getByTestId(
    "spielwiese-playground-composer-add-button",
  );
  const composerPrimary = within(composerForm).getByTestId(
    "spielwiese-playground-composer-primary",
  );
  const composerInput =
    within(composerShell).getByLabelText("Playground input");
  const composerTrailing = within(composerForm).getByTestId(
    "spielwiese-playground-composer-trailing",
  );
  const composerDictationButton = within(composerTrailing).getByTestId(
    "spielwiese-playground-composer-dictation-button",
  );
  const composerSubmitButton = within(composerShell).getByTestId(
    "spielwiese-playground-submit-button",
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
  const modelSegments = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-model-segment",
  );
  const previewRows = within(flowStrip).getAllByTestId(
    "spielwiese-playground-flow-preview-row",
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
    composerAddButton,
    composerForm,
    composerLeading,
    composerPrimary,
    composerInput,
    composerDictationButton,
    composerShell,
    composerSubmitButton,
    composerTrailing,
    flowHeaderRows,
    flowNodes,
    flowScroller,
    flowSteps,
    flowStrip,
    header,
    historyButton,
    modelSegments,
    playButton,
    previewRows,
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
  expect(simulationPane.className).toContain("px-2");
  expect(simulationPane.className).toContain("pb-2");
  expect(simulationPane.className).not.toContain("pt-2");
  expect(simulationPane.className).not.toContain("px-0");
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
  expect(terminalShell.className).toContain("overflow-hidden");
  expect(terminalShell.className).toContain("py-0");
  expect(elements.header.className).toContain("sticky");
  expect(elements.header.className).toContain("w-[calc(100%+2rem)]");
  expect(elements.header.className).toContain("pt-3");
  expect(elements.header.className).toContain("pb-3");
  expect(elements.header.className).toContain("pl-[13px]");
  expect(elements.header.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(elements.header.className).toContain("backdrop-blur");
  expect(elements.actions.className).toContain("ml-auto");
  expect(elements.actions.className).toContain("gap-2");
  expect(elements.title).toBeNull();
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
  expect(elements.composerShell.className).toContain("bottom-0");
  expect(elements.composerShell.className).toContain("justify-center");
  expect(elements.composerShell.className).toContain("bg-transparent");
  expect(elements.composerShell.className).toContain("pt-2.5");
  expect(elements.composerShell.className).toContain("pb-3");
  expect(elements.composerForm.className).toContain("rounded-[24px]");
  expect(elements.composerForm.className).toContain("flex");
  expect(elements.composerForm.className).toContain("py-1.5");
  expect(elements.composerForm.className).toContain("border");
  expect(elements.composerForm.className).toContain("w-full");
  expect(elements.composerForm.className).toContain("max-w-[32rem]");
  expect(elements.composerForm.className).toContain("bg-transparent");
  expect(elements.composerForm.className).not.toContain(
    "bg-[rgba(255,255,255,0.92)]",
  );
  expect(elements.composerLeading.className).toContain("flex");
  expect(elements.composerPrimary.className).toContain("flex-1");
  expect(elements.composerPrimary.className).toContain("px-0.5");
  expect(elements.composerTrailing.className).toContain("ml-auto");
  expect(elements.composerTrailing.className).toContain("gap-0.5");
  expect(elements.composerAddButton.getAttribute("aria-label")).toBe(
    "Add files and more",
  );
  expect(elements.composerDictationButton.getAttribute("aria-label")).toBe(
    "Start dictation",
  );
  expect(elements.composerInput.getAttribute("placeholder")).toBe(
    "Ask anything",
  );
  expect(elements.composerSubmitButton.getAttribute("aria-label")).toBe(
    "Run playground input",
  );
  expect(elements.composerSubmitButton.className).toContain("h-9");
  expect(elements.composerSubmitButton.className).toContain("w-9");
  expect(elements.composerSubmitButton.hasAttribute("disabled")).toBe(true);
  expect(flowScroller.className).toContain("w-full");
  expect(flowScroller.className).toContain("min-w-0");
  expect(flowScroller.className).toContain("flex-1");
  expect(flowScroller.className).toContain("overflow-y-auto");
  expect(flowScroller.className).toContain("pb-3");
  expect(flowScroller.className).not.toContain("overflow-x-auto");
  expect(flowStrip.className).toContain("items-start");
  expect(flowStrip.className).toContain("inline-flex");
  expect(flowStrip.className).toContain("min-w-full");
  expect(simulationPane.textContent).not.toContain("Sample message");
  expect(simulationPane.textContent).not.toContain("Preview");
  expect(flowSteps).toHaveLength(3);
  expect(flowNodes).toHaveLength(3);
  expect(previewRows).toHaveLength(3);
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
  const firstPreviewRow = elements.previewRows[0]!;
  const firstPreviewBody = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-body",
  );
  const firstPreviewFieldShell = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-field-shell",
  );
  const firstPreviewValue = within(firstPreviewRow).getByTestId(
    "spielwiese-playground-flow-preview-value",
  );

  expect(firstFlowStep.className).toContain("[--node-shell-gap:2px]");
  expect(firstFlowStep.className).toContain("[--node-shell-radius:16px]");
  expect(firstFlowStep.className).toContain("flex");
  expect(firstFlowStep.className).toContain("flex-col");
  expect(firstFlowStep.className).toContain("min-w-full");
  expect(firstFlowStep.className).toContain("shrink-0");
  expect(firstFlowStep.className).not.toContain("w-[30rem]");
  expect(firstFlowStep.className).toContain("bg-[#FBFBFB]");
  expect(firstFlowStep.className).toContain("gap-1.5");
  expect(firstFlowStep.className).toContain("px-[2px]");
  expect(firstFlowStep.className).toContain("pt-[2px]");
  expect(firstFlowStep.className).toContain("pb-[2px]");
  expect(firstFlowStep.firstElementChild).toBe(firstFlowNode);
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("closed");
  expect(firstFlowNode.contains(firstUserIcon)).toBe(true);
  expect(secondFlowNode.contains(secondUserIcon)).toBe(true);
  expect(firstFlowNode.className).toContain("border-border/40");
  expect(firstFlowNode.className).toContain("bg-background/96");
  expect(firstFlowNode.className).toContain("flex");
  expect(firstFlowNode.className).toContain("w-full");
  expect(firstFlowNode.className).toContain("min-w-0");
  expect(firstFlowNode.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(firstFlowHeaderRow.className).toContain("flex");
  expect(firstFlowHeaderRow.className).toContain("w-full");
  expect(firstFlowHeaderRow.className).toContain("min-w-0");
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
  expect(firstTitleSurface.className).toContain("max-w-full");
  expect(firstTitleSurface.className).toContain("min-w-0");
  expect(firstTitleSurface.className).not.toContain("flex-1");
  expect(firstTitleSurface.className).toContain(
    "rgba(16,163,127,0.18)_0%,rgba(16,163,127,0.08)_32%",
  );
  expect(firstModelSegment.textContent).toContain("GPT-4.1 mini");
  expect(firstModelSegment.className).toContain("shrink-0");
  expect(firstModelSegment.className).not.toContain("flex-1");
  expect(firstPreviewRow.className).toContain("rounded-xl");
  expect(firstPreviewRow.className).toContain("bg-muted/24");
  expect(firstPreviewRow.getAttribute("data-section-id")).toBe("system");
  expect(firstPreviewBody.className).toContain("pt-[9px]");
  expect(firstPreviewFieldShell.className).toContain("bg-[#F1F2F2]");
  expect(firstPreviewFieldShell.className).toContain("flex-col");
  expect(firstPreviewValue.className).toContain("bg-[#FBFBFB]");
  expect(firstPreviewValue.className).toContain("font-mono");
  expect(firstPreviewValue.className).toContain("whitespace-pre-wrap");
  expect(firstPreviewValue.className).toContain(
    "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
  );
  expect(firstPreviewRow.textContent).toContain("Answer");
  expect(firstPreviewValue.textContent).toContain('"item": "grilled salmon"');
  expect(firstPreviewValue.textContent).toContain('"estimated_weight_g": 186');
  expect(firstFlowNode.textContent).toContain("Vision Agent");
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

function expectPlaygroundComposerSubmission(
  elements: ReturnType<typeof getPromptSimulationElements>,
) {
  const firstThinkingCardShell = elements.thinkingCardShells[0]!;

  fireEvent.change(elements.composerInput, {
    target: { value: "Could you check whether this meal is protein heavy?" },
  });
  fireEvent.click(elements.composerSubmitButton);

  expect((elements.composerInput as HTMLTextAreaElement).value).toBe(
    "Could you check whether this meal is protein heavy?",
  );
  expect(elements.composerSubmitButton.hasAttribute("disabled")).toBe(false);
  expect(firstThinkingCardShell.getAttribute("data-state")).toBe("open");
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
    expectPlaygroundComposerSubmission(elements);
  });
});
