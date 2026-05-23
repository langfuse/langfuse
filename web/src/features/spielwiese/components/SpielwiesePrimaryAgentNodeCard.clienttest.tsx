import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

describe("SpielwiesePrimaryAgentNodeCard compact shell", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("keeps the header frame flush in compact mode so the gray bottom edge remains visible", () => {
    renderCanvas();

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const expandedHeaderFrame = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-frame",
    );
    const expandedViewport = within(visionNode).getByTestId(
      "spielwiese-agent-node-card-viewport",
    );

    expect(expandedHeaderFrame.className).toContain("-mb-0.5");
    expect(expandedViewport.getAttribute("data-collapse-transition")).toBe(
      "idle",
    );

    fireEvent.click(
      within(expandedHeaderFrame).getByRole("button", {
        name: "Minimize vision-agent node sections",
      }),
    );

    expect(expandedViewport.getAttribute("data-collapse-transition")).toBe(
      "collapsing",
    );

    act(() => {
      jest.advanceTimersByTime(90);
    });

    const collapsedVisionNode = screen.getAllByTestId(
      "spielwiese-agent-node",
    )[0];
    const collapsedHeaderFrame = within(collapsedVisionNode).getByTestId(
      "spielwiese-agent-node-header-frame",
    );
    const collapsedViewport = within(collapsedVisionNode).getByTestId(
      "spielwiese-agent-node-card-viewport",
    );

    expect(collapsedHeaderFrame.className).toContain("mb-0");
    expect(collapsedHeaderFrame.className).not.toContain("-mb-0.5");
    expect(collapsedViewport.getAttribute("data-collapse-transition")).toBe(
      "expanding",
    );

    act(() => {
      jest.advanceTimersByTime(170);
    });

    expect(collapsedViewport.getAttribute("data-collapse-transition")).toBe(
      "idle",
    );
  });
});
