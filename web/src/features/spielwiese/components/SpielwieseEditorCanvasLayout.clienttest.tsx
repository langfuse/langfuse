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
  expect(nodeCard.className).toContain("[--node-shell-radius:18px]");
  expect(nodeCard.className).toContain("rounded-(--node-shell-radius)");
  expect(nodeCard.className).toContain("border");
  expect(nodeCard.className).toContain("border-[rgba(15,23,42,0.08)]");
  expect(nodeCard.className).toContain("bg-[#FBFBFB]");
  expect(nodeCard.className).toContain("p-0.5");
  expect(nodeCard.className).toContain("gap-0.5");
  expect(nodeCard.className).toContain(
    "shadow-[0_12px_30px_rgba(15,23,42,0.04),0_2px_6px_rgba(15,23,42,0.04)]",
  );
  expect(visionNode.className).toContain("last:pb-5");
  expect(headerShell.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(headerShell.className).toContain("border-border/40");
  expect(headerShell.className).toContain("bg-background/96");
  expect(headerShell.className).toContain("pb-[3px]");
  expect(headerShell.className).not.toContain("shadow-[");
  expect(headerRow.className).toContain("pl-[6px]");
  expect(headerRow.className).toContain("pr-[6px]");
  expect(headerRow.className).toContain("pt-[6px]");
  expect(headerRow.className).toContain("pb-[6px]");
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
    const nodes = screen.getAllByTestId("spielwiese-agent-node");

    expect(widget.className).toContain("@container");
    expect(widget.className).toContain("h-full");
    expect(widget.className).toContain("overflow-hidden");
    expect(widget.className).toContain("flex-1");
    expect(editorPane.className).toContain("bg-[#F3F3F4]");
    expect(editorPane.className).toContain("px-0");
    expect(editorPane.className).toContain("pb-2");
    expect(editorPane.className).not.toContain("pt-2");
    expect(editorPane.className).not.toContain("px-2");
    expect(editorPane.className).not.toContain("border-x");
    expect(editorPane.className).not.toContain("border-t");
    expect(editorPane.className).not.toContain("border-b-0");
    expect(editorPaneShell.className).toContain("rounded-[8px]");
    expect(editorPaneShell.className).not.toContain("rounded-b-[8px]");
    expect(editorPaneShell.className).toContain("bg-background");
    expect(editorPaneShell.className).toContain("overflow-y-auto");
    expect(editorPaneShell.className).toContain("overflow-x-hidden");
    expect(editorPaneShell.className).toContain("px-0");
    expect(editorPaneShell.className).toContain("py-0");
    expect(editorPaneShell.className).not.toContain("px-4");
    expect(editorPaneShell.className).not.toContain("sm:px-5");
    expect(editorNodeStack.className).not.toContain("overflow-y-auto");
    expect(editorNodeStack.className).toContain("pt-4");
    expect(editorNodeStack.className).toContain("pb-2");
    expect(simulationPane.className).toContain("px-0");
    expect(simulationPane.className).toContain("pb-0");
    expect(simulationPane.className).not.toContain("px-2");
    expect(simulationPane.className).not.toContain("border-t-0");
    expect(resizeHandle).toBeTruthy();
    expect(nodes).toHaveLength(3);
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
