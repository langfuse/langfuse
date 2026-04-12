import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function getEditorModeButtons() {
  const editorModeHeader = screen.getByTestId(
    "spielwiese-canvas-editor-mode-header",
  );
  const editorModeToggle = within(editorModeHeader).getByTestId(
    "spielwiese-canvas-editor-mode-toggle",
  );

  return {
    builderModeButton: within(editorModeToggle).getByRole("button", {
      name: "Builder mode",
    }),
    editorModeHeader,
    jsonModeButton: within(editorModeToggle).getByRole("button", {
      name: "JSON mode",
    }),
  };
}

function expectBuilderModeVisible() {
  expect(screen.getByTestId("spielwiese-agent-node-stack")).toBeTruthy();
  expect(screen.queryByTestId("spielwiese-canvas-json-editor")).toBeNull();
}

function expectJsonModeVisible() {
  expect(screen.queryByTestId("spielwiese-agent-node-stack")).toBeNull();
  expect(screen.getByTestId("spielwiese-canvas-json-editor")).toBeTruthy();
}

describe("SpielwieseCanvasPane editor mode", () => {
  it("switches between builder mode and JSON mode and applies valid JSON edits back into the builder", () => {
    renderCanvas();

    const { builderModeButton, editorModeHeader, jsonModeButton } =
      getEditorModeButtons();

    expect(editorModeHeader.className).toContain("pt-2");
    expect(editorModeHeader.className).toContain("justify-end");
    expect(builderModeButton.getAttribute("aria-pressed")).toBe("true");
    expect(jsonModeButton.getAttribute("aria-pressed")).toBe("false");
    expectBuilderModeVisible();

    fireEvent.click(jsonModeButton);

    const jsonEditor = screen.getByTestId("spielwiese-canvas-json-editor");
    const jsonInput = within(jsonEditor).getByTestId(
      "spielwiese-canvas-json-input",
    );

    expect(builderModeButton.getAttribute("aria-pressed")).toBe("false");
    expect(jsonModeButton.getAttribute("aria-pressed")).toBe("true");
    expectJsonModeVisible();
    expect(jsonEditor.className).toContain("mx-2");
    expect(jsonInput.className).toContain("font-mono");
    expect((jsonInput as HTMLTextAreaElement).value).toContain(
      '"id": "vision-agent"',
    );

    fireEvent.change(jsonInput, {
      target: {
        value: (jsonInput as HTMLTextAreaElement).value.replace(
          '"Vision Agent"',
          '"Vision Agent JSON"',
        ),
      },
    });
    fireEvent.click(builderModeButton);

    expect(screen.getByDisplayValue("Vision Agent JSON")).toBeTruthy();
    expectBuilderModeVisible();
  });

  it("keeps JSON mode open when the draft is invalid", () => {
    renderCanvas();

    const { jsonModeButton } = getEditorModeButtons();

    fireEvent.click(jsonModeButton);

    const jsonInput = screen.getByTestId("spielwiese-canvas-json-input");

    fireEvent.change(jsonInput, {
      target: {
        value: "{",
      },
    });
    fireEvent.click(getEditorModeButtons().builderModeButton);

    expectJsonModeVisible();
    expect(screen.getByTestId("spielwiese-canvas-json-error")).toBeTruthy();
  });
});
