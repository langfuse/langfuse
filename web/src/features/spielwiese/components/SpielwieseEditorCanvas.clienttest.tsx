import { render, screen } from "@testing-library/react";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";

describe("SpielwieseEditorCanvas", () => {
  const canvas = {
    title: "Assistant",
    helper: "Start from a blank page and shape the structure from the rail.",
    stats: [
      {
        id: "blocks",
        label: "Blocks",
        value: "01",
      },
    ],
  };

  it("renders with a local container-query root", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const widget = screen.getByTestId("spielwiese-editor-canvas");
    const panes = screen.getAllByTestId("spielwiese-editor-canvas-pane");
    expect(widget.className).toContain("@container");
    expect(widget.className).toContain("h-full");
    expect(widget.className).toContain("overflow-hidden");
    expect(widget.className).toContain("flex-1");
    expect(panes).toHaveLength(2);
    expect(panes[0]?.className).toContain("rounded-t-lg");
    expect(panes[1]?.className).toContain("rounded-none");
  });

  it("keeps the canvas minimal without the trailing stats footer", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    expect(screen.queryByText(canvas.helper)).toBeNull();
    expect(screen.queryByText("01")).toBeNull();
    expect(screen.queryByText("Assistant")).toBeNull();
  });
});
