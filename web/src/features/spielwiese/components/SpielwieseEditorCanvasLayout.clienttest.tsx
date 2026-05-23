/* eslint-disable max-lines */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import { getModelShellTintClassName } from "./spielwieseModelTint";

const testCanvas = spielwieseEditorCanvasTestCanvas;

const renderCanvas = () =>
  render(<SpielwieseEditorCanvas canvas={testCanvas} />);

function renderOnboardingPreviewCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={testCanvas} chrome="onboarding-preview" />,
  );
}

function getLayoutShellElements() {
  const editorModeHeader = screen.getByTestId(
    "spielwiese-canvas-editor-mode-header",
  );
  const editorNodeInsertRow = screen.getByTestId(
    "spielwiese-agent-node-external-insert-row",
  );

  return {
    editorActions: within(editorModeHeader).getByTestId(
      "spielwiese-canvas-pane-actions",
    ),
    editorModeHeader,
    editorModeToggle: within(editorModeHeader).getByTestId(
      "spielwiese-canvas-editor-mode-toggle",
    ),
    editorNodeInsertFooter: screen.getByTestId(
      "spielwiese-agent-node-insert-footer",
    ),
    nodeConnectors: screen.getAllByTestId("spielwiese-agent-node-connector"),
    editorNodeInsertRow,
    editorNodeStack: screen.getByTestId("spielwiese-agent-node-stack"),
    editorPane: screen.getByTestId("spielwiese-editor-canvas-pane"),
    editorPaneShell: screen.getByTestId("spielwiese-editor-canvas-pane-shell"),
    editorPaneSurface: screen.getByTestId(
      "spielwiese-editor-canvas-pane-surface",
    ),
    nodes: screen.getAllByTestId("spielwiese-agent-node"),
    resizeHandle: screen.getByTestId("spielwiese-canvas-pane-resize-handle"),
    simulationPane: screen.getByTestId("spielwiese-prompt-simulation-pane"),
    widget: screen.getByTestId("spielwiese-editor-canvas"),
  };
}

function expectLayoutShellChrome({
  editorPane,
  editorPaneShell,
  editorPaneSurface,
  widget,
}: ReturnType<typeof getLayoutShellElements>) {
  expect(widget.className).toContain("@container");
  expect(widget.className).toContain("isolate");
  expect(widget.className).toContain("h-full");
  expect(widget.className).toContain("overflow-hidden");
  expect(widget.className).toContain("flex-1");
  expect(editorPane.className).toContain(
    "bg-[var(--spielwiese-canvas-pane-background)]",
  );
  expect(editorPane.className).toContain("[--canvas-pane-inner-radius:18px]");
  expect(editorPane.className).toContain("[--canvas-pane-shell-gap:2px]");
  expect(editorPane.className).toContain(
    "[--canvas-pane-outer-radius:calc(var(--canvas-pane-inner-radius)+var(--canvas-pane-shell-gap))]",
  );
  expect(editorPane.className).toContain(
    "rounded-[var(--canvas-pane-outer-radius)]",
  );
  expect(editorPane.className).toContain("px-0");
  expect(editorPane.className).toContain("pb-0");
  expect(editorPane.className).not.toContain("rounded-none");
  expect(editorPane.className).not.toContain("ring-1");
  expect(editorPane.className).not.toContain("pt-2");
  expect(editorPane.className).not.toContain("px-2");
  expect(editorPane.className).not.toContain("border-x");
  expect(editorPane.className).not.toContain("border-t");
  expect(editorPane.className).not.toContain("border-b-0");
  expect(editorPaneShell.className).toContain(
    "rounded-[var(--canvas-pane-outer-radius)]",
  );
  expect(editorPaneShell.className).toContain(
    "bg-[var(--spielwiese-canvas-pane-shell-background)]",
  );
  expect(editorPaneShell.className).toContain("overflow-hidden");
  expect(editorPaneShell.className).toContain(
    "p-[var(--canvas-pane-shell-gap)]",
  );
  expect(editorPaneShell.className).not.toContain("px-4");
  expect(editorPaneShell.className).not.toContain("sm:px-5");
  expect(editorPaneShell.className).not.toContain("ring-1");
  expect(editorPaneSurface.className).toContain("bg-background");
  expect(editorPaneSurface.className).toContain(
    "rounded-[var(--canvas-pane-inner-radius)]",
  );
  expect(editorPaneSurface.className).toContain("min-h-full");
  expect(editorPaneSurface.className).toContain("flex-1");
  expect(editorPaneSurface.className).toContain("px-2");
  expect(editorPaneSurface.className).toContain("pt-0");
  expect(editorPaneSurface.className).toContain("pb-[6px]");
  expect(editorPaneSurface.className).not.toContain("ring-1");
}

function expectButtonIsInert(button: HTMLElement) {
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.getAttribute("tabindex")).toBe("-1");
  expect(button.className).toContain("pointer-events-none");
}

function expectLayoutAccessories({
  editorActions,
  editorModeHeader,
  editorModeToggle,
  nodeConnectors,
  editorNodeInsertFooter,
  editorNodeInsertRow,
  editorNodeStack,
  nodes,
  resizeHandle,
  simulationPane,
}: ReturnType<typeof getLayoutShellElements>) {
  expect(editorModeHeader.className).toContain("-mx-2");
  expect(editorModeHeader.className).toContain("w-[calc(100%+1rem)]");
  expect(editorModeHeader.className).toContain("py-2");
  expect(editorModeHeader.className).toContain("px-2");
  expect(editorModeHeader.className).toContain("justify-between");
  expect(editorModeHeader.firstElementChild).toBe(editorModeToggle);
  expect(editorModeHeader.lastElementChild).toBe(editorActions);
  expect(editorModeHeader.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(editorModeHeader.className).toContain("backdrop-blur");
  expect(editorModeHeader.className).not.toContain("border-b");
  const archiveCanvasButton = within(editorActions).getByRole("button", {
    name: "Archive canvas nodes",
  });
  const closeSidePanelsButton = within(editorActions).getByRole("button", {
    name: "Close side panels",
  });
  expectButtonIsInert(archiveCanvasButton);
  expectButtonIsInert(closeSidePanelsButton);
  expect(editorModeToggle.className).toContain("rounded-[9px]");
  expect(editorModeToggle.className).toContain("bg-[#F7F7F7]");
  expect(editorNodeStack.className).not.toContain("overflow-y-auto");
  expect(editorNodeStack.className).toContain("pt-2");
  expect(editorNodeStack.className).toContain("pb-2");
  expect(nodeConnectors).toHaveLength(2);
  expect(editorNodeInsertFooter.className).toContain("flex-none");
  expect(editorNodeInsertFooter.className).toContain("-mx-2");
  expect(editorNodeInsertFooter.className).toContain("w-[calc(100%+1rem)]");
  expect(editorNodeInsertFooter.className).toContain("justify-start");
  expect(editorNodeInsertFooter.className).toContain(
    "rounded-b-[var(--canvas-pane-inner-radius)]",
  );
  expect(editorNodeInsertFooter.className).toContain(
    "-mb-[calc(var(--canvas-pane-shell-gap)+6px)]",
  );
  expect(editorNodeInsertRow.className).not.toContain("mt-[8px]");
  expect(editorNodeInsertFooter.className).not.toContain("pb-2");
  expect(editorNodeInsertFooter.className).not.toContain("border-t");
  expect(editorNodeInsertRow.className).not.toContain("pl-[18px]");
  expect(editorNodeInsertRow.className).not.toContain("ml-[8px]");
  expect(editorNodeInsertRow.className).not.toContain("ml-[18px]");
  expect(simulationPane.className).toContain("px-0");
  expect(simulationPane.className).toContain("pt-0.5");
  expect(simulationPane.className).toContain("pb-0");
  expect(simulationPane.className).not.toContain("px-2");
  expect(simulationPane.className).not.toContain("border-t-0");
  expect(resizeHandle).toBeTruthy();
  expect(nodes).toHaveLength(3);
}

function getVisionNodeChromeElements() {
  const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];

  return {
    headerFrame: within(visionNode).getByTestId(
      "spielwiese-agent-node-header-frame",
    ),
    headerRow: within(visionNode).getByTestId(
      "spielwiese-agent-node-header-row",
    ),
    headerShell: within(visionNode).getByTestId(
      "spielwiese-agent-node-header-shell",
    ),
    nodeCard: within(visionNode).getByTestId("spielwiese-agent-node-card"),
    visionModelButton: screen.getByRole("button", {
      name: "vision-agent Model",
    }),
    visionNode,
  };
}

function expectVisibleAgentNodeLabels() {
  expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
  expect(screen.getByDisplayValue("Nutrition Agent")).toBeTruthy();
  expect(screen.getByDisplayValue("Coach Agent")).toBeTruthy();
  expect(screen.queryByDisplayValue("coach_summary")).toBeNull();
  expect(
    screen.queryByText(spielwieseEditorCanvasTestCanvas.helper),
  ).toBeNull();
  expect(screen.queryByText("01")).toBeNull();
}

// eslint-disable-next-line max-lines-per-function
function expectVisionNodeChrome({
  headerFrame,
  headerRow,
  headerShell,
  nodeCard,
  visionModelButton,
  visionNode,
}: {
  headerFrame: HTMLElement;
  headerRow: HTMLElement;
  headerShell: HTMLElement;
  nodeCard: HTMLElement;
  visionModelButton: HTMLElement;
  visionNode: HTMLElement;
}) {
  expect(visionModelButton.textContent).toContain("GPT-4.1 mini");
  expect(
    within(visionModelButton).getByTestId("spielwiese-provider-mark-openai"),
  ).toBeTruthy();
  expect(nodeCard.className).toContain("group");
  expect(nodeCard.className).toContain("[--node-shell-gap:2px]");
  expect(nodeCard.className).toContain("[--node-shell-radius:18px]");
  expect(nodeCard.className).toContain("rounded-(--node-shell-radius)");
  expect(nodeCard.className).toContain("border");
  expect(nodeCard.className).toContain(
    "border-[color:var(--spielwiese-agent-node-shell-border)]",
  );
  expect(nodeCard.className).toContain(
    getModelShellTintClassName("openai/gpt-5-mini"),
  );
  expect(nodeCard.className).not.toMatch(/\bp-0\.5\b/);
  expect(nodeCard.className).toContain("gap-0.5");
  expect(nodeCard.className).toContain("shadow-none");
  expect(visionNode.className).toContain("last:pb-5");
  expect(headerFrame.className).toContain(
    getModelShellTintClassName("openai/gpt-5-mini"),
  );
  expect(headerFrame.className).toContain("p-0.5");
  expect(headerFrame.className).toContain("-mb-0.5");
  expect(headerFrame.className).toContain("rounded-[var(--node-shell-radius)]");
  expect(headerFrame.contains(headerShell)).toBe(true);
  expect(headerShell.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(headerShell.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(headerShell.className).toContain(
    "bg-[var(--spielwiese-agent-node-header-active-surface)]",
  );
  expect(headerShell.className).not.toContain("backdrop-blur");
  expect(headerShell.className).toContain("pb-[4px]");
  expect(headerShell.className).toContain("overflow-hidden");
  expect(headerShell.className).not.toContain("shadow-[");
  expect(headerRow.className).toContain("pl-[6px]");
  expect(headerRow.className).toContain("pr-[6px]");
  expect(headerRow.className).toContain("pt-[5px]");
  expect(headerRow.className).toContain("pb-[7px]");
  expect(headerRow.className).toContain("border-b");
  expect(headerRow.className).toContain(
    "border-[color:var(--spielwiese-agent-node-header-divider)]",
  );
  expect(headerRow.className).toContain(
    "bg-[var(--spielwiese-agent-node-header-active-surface)]",
  );
}

describe("SpielwieseEditorCanvas layout shell", () => {
  it("renders with a local container-query root", () => {
    renderCanvas();
    const layoutElements = getLayoutShellElements();
    expectLayoutShellChrome(layoutElements);
    expectLayoutAccessories(layoutElements);
  });

  it("can hide editor chrome for onboarding preview without changing the default canvas shell", () => {
    renderOnboardingPreviewCanvas();

    expect(screen.getByTestId("spielwiese-editor-canvas")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-editor-canvas-pane")).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-canvas-editor-mode-header"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-agent-node-insert-footer"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-canvas-pane-resize-handle"),
    ).toBeNull();
    expect(screen.queryByTestId("spielwiese-canvas-bottom-panel")).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Create tool" })).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-agent-node-header-actions"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-response-format-composer"),
    ).toBeNull();
    expect(screen.queryByLabelText("vision-agent title")).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-agent-node-card-back-button"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-agent-node-card-add-button"),
    ).toBeNull();
  });
});

describe("SpielwieseEditorCanvas node chrome", () => {
  it("renders three agent nodes with visible settings and no stats footer", () => {
    renderCanvas();
    expectVisibleAgentNodeLabels();
    expectVisionNodeChrome(getVisionNodeChromeElements());
  });
});
describe("SpielwieseEditorCanvas inline setting tags", () => {
  it("reveals inline setting tags on click and collapses them on blur", () => {
    renderCanvas();
    const coachNode = screen.getAllByTestId("spielwiese-agent-node")[2];
    const temperatureSettingTag = within(coachNode).getByTestId(
      "spielwiese-inline-setting-tag-temperature",
    );

    expect(temperatureSettingTag.tagName).toBe("BUTTON");
    expect(temperatureSettingTag.getAttribute("data-state")).toBe("closed");

    fireEvent.mouseEnter(temperatureSettingTag);
    expect(temperatureSettingTag.getAttribute("data-state")).toBe("closed");

    fireEvent.click(temperatureSettingTag);
    expect(temperatureSettingTag.getAttribute("data-state")).toBe("open");

    fireEvent.blur(temperatureSettingTag);
    expect(temperatureSettingTag.getAttribute("data-state")).toBe("closed");
  });
});
