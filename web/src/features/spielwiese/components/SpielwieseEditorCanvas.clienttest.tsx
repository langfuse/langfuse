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
    expect(widget.className).toContain("@container");
  });

  it("renders canvas stats with tabular numerals", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const value = screen.getByText("01");
    expect(value.className).toContain("tabular-nums");
  });
});
