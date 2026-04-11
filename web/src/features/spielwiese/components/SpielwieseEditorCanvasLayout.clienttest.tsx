import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function expectVisionNodeChrome({
  headerRow,
  headerShell,
  nodeCard,
  visionModelButton,
  visionNode,
}: {
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
  expect(nodeCard.className).toContain("[--node-shell-radius:16px]");
  expect(nodeCard.className).toContain("rounded-(--node-shell-radius)");
  expect(nodeCard.className).toContain("border");
  expect(nodeCard.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(nodeCard.className).toContain("bg-[#FBFBFB]");
  expect(nodeCard.className).toContain("px-[2px]");
  expect(nodeCard.className).toContain("pt-[2px]");
  expect(nodeCard.className).toContain("pb-[2px]");
  expect(nodeCard.className).toContain("gap-1.5");
  expect(visionNode.className).toContain("last:pb-5");
  expect(headerShell.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(headerShell.className).toContain("bg-background/96");
  expect(headerShell.className).not.toContain("shadow-[");
  expect(headerRow.className).toContain("pl-[6px]");
  expect(headerRow.className).toContain("pt-[6px]");
  expect(headerRow.className).toContain("pb-[6px]");
}

function getCanvasPaneModeElements() {
  const paneModeToggle = screen.getByTestId(
    "spielwiese-canvas-pane-mode-toggle",
  );
  const playgroundToggle = within(paneModeToggle).getByRole("button", {
    name: "Playground",
  });
  const evaluationToggle = within(paneModeToggle).getByRole("button", {
    name: "Evaluation",
  });

  return {
    evaluationToggle,
    paneModeToggle,
    playgroundToggle,
  };
}

function expectPaneModeToggleChrome({
  evaluationToggle,
  paneModeToggle,
  playgroundHeader,
  playgroundToggle,
}: ReturnType<typeof getCanvasPaneModeElements> & {
  playgroundHeader: HTMLElement;
}) {
  expect(
    within(playgroundHeader).queryByTestId("spielwiese-playground-title"),
  ).toBeNull();
  expect(paneModeToggle).toBeTruthy();
  expect(paneModeToggle.className).toContain("bg-muted");
  expect(paneModeToggle.className).toContain("rounded-2xl");
  expect(paneModeToggle.className).toContain("p-1");
  expect(paneModeToggle.className).not.toContain("shadow-[");
  expect(playgroundToggle.className).toContain("bg-background");
  expect(playgroundToggle.className).not.toContain("bg-[#15181C]");
  expect(playgroundToggle.className).not.toContain("shadow-[");
  expect(evaluationToggle.className).toContain("text-muted-foreground");
}

function getPlaygroundHeaderElements() {
  const simulationPane = screen.getByTestId(
    "spielwiese-prompt-simulation-pane",
  );
  const playgroundHeader = within(simulationPane).getByTestId(
    "spielwiese-playground-header",
  );

  return {
    playgroundHeader,
    simulationPane,
  };
}

describe("SpielwieseEditorCanvas layout shell", () => {
  it("renders with a local container-query root", () => {
    renderCanvas();
    const widget = screen.getByTestId("spielwiese-editor-canvas");
    const editorPane = screen.getByTestId("spielwiese-editor-canvas-pane");
    const editorPaneShell = screen.getByTestId(
      "spielwiese-editor-canvas-pane-shell",
    );
    const editorNodeStack = screen.getByTestId("spielwiese-agent-node-stack");
    const simulationPane = screen.getByTestId(
      "spielwiese-prompt-simulation-pane",
    );
    const resizeHandle = screen.getByTestId(
      "spielwiese-canvas-pane-resize-handle",
    );
    const { evaluationToggle, paneModeToggle, playgroundToggle } =
      getCanvasPaneModeElements();
    const { playgroundHeader } = getPlaygroundHeaderElements();
    const nodes = screen.getAllByTestId("spielwiese-agent-node");

    expect(widget.className).toContain("@container");
    expect(widget.className).toContain("h-full");
    expect(widget.className).toContain("overflow-hidden");
    expect(widget.className).toContain("flex-1");
    expect(editorPane.className).toContain("bg-[#15181C]");
    expect(editorPane.className).toContain("p-2");
    expect(editorPane.className).not.toContain("border-x");
    expect(editorPane.className).not.toContain("border-t");
    expect(editorPane.className).not.toContain("border-b-0");
    expect(editorPaneShell.className).toContain("rounded-[8px]");
    expect(editorPaneShell.className).toContain("bg-background");
    expect(editorPaneShell.className).toContain("overflow-y-auto");
    expect(editorPaneShell.className).toContain("overflow-x-hidden");
    expect(editorPaneShell.className).toContain("py-0");
    expect(editorNodeStack.className).not.toContain("overflow-y-auto");
    expect(editorNodeStack.className).toContain("pt-4");
    expect(editorNodeStack.className).toContain("pb-2");
    expect(simulationPane.className).toContain("rounded-none");
    expect(simulationPane.className).not.toContain("border-t-0");
    expect(resizeHandle).toBeTruthy();
    expect(playgroundHeader.className).toContain("sticky");
    expect(playgroundHeader.className).toContain("backdrop-blur");
    expect(paneModeToggle).toBeTruthy();
    expect(playgroundToggle.getAttribute("aria-pressed")).toBe("true");
    expect(evaluationToggle.getAttribute("aria-pressed")).toBe("false");
    expect(nodes).toHaveLength(3);
  });
});

describe("SpielwieseEditorCanvas pane mode toggle chrome", () => {
  it("renders a sticky lower-pane header with the mode toggle and a plain resize line", () => {
    renderCanvas();
    const { evaluationToggle, paneModeToggle, playgroundToggle } =
      getCanvasPaneModeElements();
    const resizeHandle = screen.getByTestId(
      "spielwiese-canvas-pane-resize-handle",
    );
    const { playgroundHeader } = getPlaygroundHeaderElements();

    expect(resizeHandle.className).toContain("shrink-0");
    expect(resizeHandle.className).toContain("bg-[#15181C]");
    expect(resizeHandle.className).toContain("h-px");
    expect(resizeHandle.className).toContain("hover:ring-1");
    expect(resizeHandle.className).toContain("hover:ring-border/70");
    expect(
      within(resizeHandle).queryByTestId("spielwiese-canvas-pane-mode-toggle"),
    ).toBeNull();
    expect(playgroundHeader.className).toContain("sticky");
    expect(playgroundHeader.className).toContain("bg-[rgba(251,251,251,0.82)]");
    expect(playgroundHeader.className).toContain("backdrop-blur");
    expectPaneModeToggleChrome({
      evaluationToggle,
      paneModeToggle,
      playgroundHeader,
      playgroundToggle,
    });
    expect(within(paneModeToggle).getByText("Playground")).toBeTruthy();
    expect(within(paneModeToggle).getByText("Evaluation")).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas pane mode switching", () => {
  it("switches the lower pane between playground and evaluation", () => {
    renderCanvas();
    const { evaluationToggle } = getCanvasPaneModeElements();

    expect(
      screen.getByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-evaluation-pane")).toBeNull();

    fireEvent.click(evaluationToggle);

    expect(
      screen.queryByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeNull();
    expect(screen.getByTestId("spielwiese-evaluation-pane")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-evaluation-title").textContent).toBe(
      "Evaluation",
    );
    expect(
      screen.getByTestId("spielwiese-evaluation-header-bar").className,
    ).toContain("sticky");
    expect(
      screen.getByTestId("spielwiese-evaluation-header-bar").className,
    ).toContain("backdrop-blur");
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-playground")
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-evaluation")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("SpielwieseEditorCanvas node chrome", () => {
  it("renders three agent nodes with visible settings and no stats footer", () => {
    renderCanvas();
    const visionModelButton = screen.getByRole("button", {
      name: "vision-agent Model",
    });
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const headerShell = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-shell",
    );
    const headerRow = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-row",
    );

    expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Nutrition Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Coach Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("coach_summary")).toBeTruthy();
    expect(
      screen.queryByText(spielwieseEditorCanvasTestCanvas.helper),
    ).toBeNull();
    expect(screen.queryByText("01")).toBeNull();
    expectVisionNodeChrome({
      headerRow,
      headerShell,
      nodeCard,
      visionModelButton,
      visionNode,
    });
  });
});

describe("SpielwieseEditorCanvas inline setting tags", () => {
  it("reveals inline setting tags on click or delayed hover and collapses them on pointer leave", () => {
    jest.useFakeTimers();

    try {
      renderCanvas();
      const coachNode = screen.getAllByTestId("spielwiese-agent-node")[2];
      const inputSettingTag = within(coachNode).getByTestId(
        "spielwiese-inline-setting-tag-input",
      );

      expect(inputSettingTag.tagName).toBe("BUTTON");
      expect(inputSettingTag.getAttribute("data-state")).toBe("closed");

      fireEvent.mouseEnter(inputSettingTag);
      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(inputSettingTag.getAttribute("data-state")).toBe("closed");

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(inputSettingTag.getAttribute("data-state")).toBe("open");

      fireEvent.mouseLeave(inputSettingTag);
      expect(inputSettingTag.getAttribute("data-state")).toBe("closed");

      fireEvent.click(inputSettingTag);
      expect(inputSettingTag.getAttribute("data-state")).toBe("open");

      fireEvent.mouseLeave(inputSettingTag);
      expect(inputSettingTag.getAttribute("data-state")).toBe("closed");
    } finally {
      jest.useRealTimers();
    }
  });
});
