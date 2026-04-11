import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
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
    expect(editorPane.className).toContain("bg-[#F5F5F5]");
    expect(editorPane.className).toContain("p-2");
    expect(editorPane.className).toContain("border-b-0");
    expect(editorPaneShell.className).toContain("rounded-[8px]");
    expect(editorPaneShell.className).toContain("bg-background");
    expect(editorPaneShell.className).toContain("py-0");
    expect(editorNodeStack.className).toContain("pt-4");
    expect(editorNodeStack.className).toContain("pb-2");
    expect(simulationPane.className).toContain("rounded-none");
    expect(simulationPane.className).toContain("border-t-0");
    expect(resizeHandle).toBeTruthy();
    expect(nodes).toHaveLength(3);
  });

  it("renders a visible pane resize line that thickens on hover without a grab pill", () => {
    renderCanvas();
    const resizeHandle = screen.getByTestId(
      "spielwiese-canvas-pane-resize-handle",
    );

    expect(resizeHandle.className).toContain("shrink-0");
    expect(resizeHandle.className).toContain("bg-border/70");
    expect(resizeHandle.className).toContain("h-px");
    expect(resizeHandle.className).toContain("hover:ring-1");
    expect(resizeHandle.className).toContain("hover:ring-border/70");
    expect(resizeHandle.firstElementChild).toBeNull();
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
    expect(screen.getAllByDisplayValue("[image]")).toHaveLength(2);
    expect(visionModelButton.textContent).toContain("GPT-4.1 mini");
    expect(
      within(visionModelButton).getByTestId("spielwiese-provider-mark-openai"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("coach_summary")).toBeTruthy();
    expect(
      screen.queryByText(spielwieseEditorCanvasTestCanvas.helper),
    ).toBeNull();
    expect(screen.queryByText("01")).toBeNull();
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
    expect(headerShell.className).toContain(
      "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
    );
    expect(headerShell.className).toContain("bg-background/96");
    expect(headerShell.className).not.toContain("shadow-[");
    expect(headerRow.className).toContain("pl-[6px]");
    expect(headerRow.className).toContain("pt-[6px]");
    expect(headerRow.className).toContain("pb-[6px]");
  });
});
