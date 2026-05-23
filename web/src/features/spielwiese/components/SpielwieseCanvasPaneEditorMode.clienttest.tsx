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
  const copyButton = screen.getByTestId(
    "spielwiese-canvas-json-skill-command-button",
  );

  return {
    copyButton,
    copyIcon: copyButton.querySelector("svg"),
    helper: screen.getByTestId("spielwiese-canvas-json-skill-command"),
    jsonInput: screen.getByTestId("spielwiese-canvas-json-input"),
    tooltip: screen.getByTestId("spielwiese-canvas-json-skill-command-tooltip"),
  };
}

function expectJsonSkillHelperChrome({
  copyButton,
  copyIcon,
  helper,
  tooltip,
}: ReturnType<typeof getJsonSkillHelperElements>) {
  expect(helper.className).not.toContain("bg-[#F7F7F7]");
  expect(helper.className).toContain("group/json-skill-command");
  expect(helper.className).not.toContain("focus-within:max-w-[20rem]");
  expect(helper.className).not.toContain("hover:max-w-[20rem]");
  expect(helper.className).not.toContain("transition-[max-width,opacity]");
  expect(helper.className).not.toContain("duration-300");
  expect(helper.className).not.toContain("focus-within:duration-[560ms]");
  expect(helper.className).not.toContain("hover:duration-[560ms]");
  expect(copyButton.className).toContain("h-6");
  expect(copyButton.className).toContain("gap-0");
  expect(copyButton.className).toContain("bg-transparent");
  expect(copyButton.className).not.toContain("bg-white");
  expect(copyButton.textContent).not.toContain("Copy Skill install command");
  expect(copyIcon?.getAttribute("class")).toContain("size-3.5");
  expect(copyIcon?.getAttribute("class")).toContain("stroke-[2.2px]");
  expect(copyIcon?.getAttribute("class")).not.toContain("-translate-x-[3px]");
  expect(copyIcon?.getAttribute("class")).not.toContain(
    "group-focus-within/json-skill-command:translate-x-0",
  );
  expect(copyIcon?.getAttribute("class")).not.toContain(
    "group-hover/json-skill-command:translate-x-0",
  );
  expect(
    screen.queryByTestId("spielwiese-canvas-json-skill-command-label"),
  ).toBeNull();
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

  expect(editorModeHeader.className).toContain("py-2");
  expect(editorModeHeader.className).toContain("px-2");
  expect(editorModeHeader.className).toContain("justify-between");
  expect(editorModeHeader.className).toContain("-mx-2");
  expect(editorModeHeader.className).not.toContain("border-b");
  expect(editorModeHeader.className).toContain(
    "rounded-t-[var(--canvas-pane-inner-radius)]",
  );
  expect(editorModeHeader.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(editorModeHeader.className).toContain("backdrop-blur");
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

  const { copyIcon } = getJsonSkillHelperElements();

  expectJsonSkillHelperChrome({
    copyButton,
    copyIcon,
    helper,
    jsonInput,
    tooltip,
  });

  fireEvent.click(copyButton);

  expect(writeText).toHaveBeenCalledWith(
    getCanvasJsonSkillInstallCommand((jsonInput as HTMLTextAreaElement).value),
  );
});

it("never reveals copy helper text when the helper is hovered or clicked", () => {
  renderCanvas();

  fireEvent.click(getEditorModeButtons().jsonModeButton);

  const { copyButton, helper } = getJsonSkillHelperElements();

  expect(
    screen.queryByTestId("spielwiese-canvas-json-skill-command-label"),
  ).toBeNull();
  expect(copyButton.textContent).not.toContain("Copy Skill install command");

  fireEvent.mouseEnter(helper);
  fireEvent.click(copyButton);

  expect(helper.className).not.toContain("hover:max-w-[20rem]");
  expect(helper.className).not.toContain("focus-within:max-w-[20rem]");
  expect(copyButton.textContent).not.toContain("Copy Skill install command");
  expect(
    screen.queryByTestId("spielwiese-canvas-json-skill-command-label"),
  ).toBeNull();
  expect(helper.className).not.toContain(
    "group-hover/json-skill-command:opacity-100",
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
