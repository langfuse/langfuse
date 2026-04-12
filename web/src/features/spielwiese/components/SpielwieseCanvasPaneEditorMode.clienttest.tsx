import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import { getCanvasJsonSkillInstallCommand } from "./spielwieseCanvasPaneEditorMode";

const writeText = jest.fn();

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

function expectJsonSkillHelperHidden() {
  expect(
    screen.queryByTestId("spielwiese-canvas-json-skill-command"),
  ).toBeNull();
}

function getJsonSkillHelperElements() {
  return {
    copyButton: screen.getByTestId(
      "spielwiese-canvas-json-skill-command-button",
    ),
    helper: screen.getByTestId("spielwiese-canvas-json-skill-command"),
    jsonInput: screen.getByTestId("spielwiese-canvas-json-input"),
    tooltip: screen.getByTestId("spielwiese-canvas-json-skill-command-tooltip"),
  };
}

function expectJsonSkillHelperChrome({
  copyButton,
  helper,
  tooltip,
}: ReturnType<typeof getJsonSkillHelperElements>) {
  expect(helper.className).not.toContain("bg-[#F7F7F7]");
  expect(helper.className).toContain("hover:max-w-[20rem]");
  expect(copyButton.className).toContain("h-6");
  expect(copyButton.className).toContain("bg-transparent");
  expect(copyButton.className).not.toContain("bg-white");
  expect(copyButton.textContent).toContain("Copy Skill install command");
  expect(tooltip.getAttribute("role")).toBe("tooltip");
  expect(tooltip.textContent).toContain("generate valid canvas JSON");
  expect(tooltip.textContent).toContain("Docs");
}

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, {
    clipboard: {
      writeText,
    },
  });
});

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

it("shows the JSON skill command helper only in JSON mode and copies the scaffold prompt", () => {
  renderCanvas();

  expectJsonSkillHelperHidden();

  fireEvent.click(getEditorModeButtons().jsonModeButton);

  const { copyButton, helper, jsonInput, tooltip } =
    getJsonSkillHelperElements();

  expectJsonSkillHelperChrome({ copyButton, helper, jsonInput, tooltip });

  fireEvent.click(copyButton);

  expect(writeText).toHaveBeenCalledWith(
    getCanvasJsonSkillInstallCommand((jsonInput as HTMLTextAreaElement).value),
  );
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
