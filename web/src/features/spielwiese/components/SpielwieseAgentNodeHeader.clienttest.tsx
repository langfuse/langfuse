/* eslint-disable max-lines */
import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderVisionNodeHeader() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);

  const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
  const headerActions = within(visionNode).getByTestId(
    "spielwiese-agent-node-header-actions",
  );
  const titleInput = within(visionNode).getByLabelText("vision-agent title");
  const titleControl = within(visionNode).getByTestId(
    "spielwiese-agent-title-control",
  );
  const temperatureInput = within(visionNode).getByLabelText(
    "vision-agent Temperature",
  );
  const topPInput = within(visionNode).getByLabelText("vision-agent Top P");
  const stopSequenceInput = within(visionNode).getByLabelText(
    "vision-agent Stop sequence",
  );
  const responseFormatInput = within(visionNode).queryByLabelText(
    "vision-agent Response format",
  );
  const reasoningInput = within(visionNode).getByLabelText(
    "vision-agent Reasoning",
  );
  const modelButton = within(visionNode).getByRole("button", {
    name: "vision-agent Model",
  });
  const previewButton = within(headerActions).getByRole("button", {
    name: "Preview vision-agent node",
  });
  const archiveButton = within(headerActions).getByRole("button", {
    name: "Archive vision-agent node",
  });
  const toggleButton = within(headerActions).getByRole("button", {
    name: "Minimize vision-agent node sections",
  });
  const toolButton = within(visionNode).getByRole("button", {
    name: "Create tool",
  });

  return {
    titleInput,
    titleControl,
    temperatureInput,
    topPInput,
    stopSequenceInput,
    responseFormatInput,
    reasoningInput,
    modelButton,
    archiveButton,
    previewButton,
    toggleButton,
    toolButton,
  };
}

function createCanvasWithVisionSettings(
  settings: (typeof spielwieseEditorCanvasTestCanvas.agentNodes)[number]["settings"],
) {
  return {
    ...spielwieseEditorCanvasTestCanvas,
    agentNodes: spielwieseEditorCanvasTestCanvas.agentNodes.map(
      (node, index) => (index === 0 ? { ...node, settings } : node),
    ),
  };
}

function createCanvasWithVisionModelValue(modelValue: string) {
  return createCanvasWithVisionSettings(
    spielwieseEditorCanvasTestCanvas.agentNodes[0]!.settings.map((setting) =>
      setting.id === "model" ? { ...setting, value: modelValue } : setting,
    ),
  );
}

function createCanvasWithVisionTitle(title: string) {
  return {
    ...spielwieseEditorCanvasTestCanvas,
    agentNodes: spielwieseEditorCanvasTestCanvas.agentNodes.map(
      (node, index) => (index === 0 ? { ...node, title } : node),
    ),
  };
}

function expectHeaderParamValues({
  reasoningInput,
  responseFormatInput,
  stopSequenceInput,
  temperatureInput,
  titleInput,
  topPInput,
}: ReturnType<typeof renderVisionNodeHeader>) {
  expect((titleInput as HTMLInputElement).value).toBe("Vision Agent");
  expect((topPInput as HTMLInputElement).value).toBe("1.0");
  expect((stopSequenceInput as HTMLInputElement).value).toBe("none");
  expect(responseFormatInput).toBeNull();
  expect((reasoningInput as HTMLInputElement).value).toBe("off / 0 tok");
  expect(temperatureInput.className).toContain("tabular-nums");
  expect(temperatureInput.className).toContain("[field-sizing:content]");
  expect(temperatureInput.className).toContain("w-auto");
  expect(temperatureInput.className).toContain("min-w-[1ch]");
  expect(temperatureInput.className).not.toContain("w-full");
  expect(reasoningInput.className).toContain("[field-sizing:content]");
  expect(reasoningInput.className).toContain("w-auto");
  expect(reasoningInput.className).toContain("min-w-[1ch]");
  expect(reasoningInput.className).not.toContain("w-full");
}

// eslint-disable-next-line complexity
function expectHeaderChromeTags({
  responseFormatInput,
  temperatureInput,
  toolButton,
}: Pick<
  ReturnType<typeof renderVisionNodeHeader>,
  "responseFormatInput" | "temperatureInput" | "toolButton"
>) {
  const temperatureShell = temperatureInput.parentElement;
  const temperatureTag = temperatureInput.parentElement?.firstElementChild;
  const toolTag = toolButton.firstElementChild;

  expect(responseFormatInput).toBeNull();
  expect(temperatureTag).toBeTruthy();
  expect(toolTag).toBeTruthy();
  expect(temperatureShell?.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(temperatureShell?.className).toContain("bg-background");
  expect(temperatureShell?.className).toContain("rounded-[8px]");
  expect(temperatureTag?.className).toContain("w-6");
  expect(temperatureTag?.getAttribute("data-state")).toBe("closed");
  expect(toolTag?.className).toContain("w-6");
  expect(toolTag?.className).not.toContain("hover:w-[4rem]");
  expect(temperatureTag?.textContent).toContain("Temperature");
  expect(toolTag?.textContent).toContain("Tools");
  expect(toolButton.getAttribute("aria-disabled")).toBe("true");
  expect(toolButton.getAttribute("tabindex")).toBe("-1");
  expect(toolButton.className).toContain("pointer-events-none");
  expect(toolButton.className).toContain("cursor-default");
  expect(toolButton.className).not.toContain("hover:bg-");
  expect(toolButton.className).not.toContain("hover:text-");
}

function expectHeaderChromeModelButton({
  modelButton,
}: Pick<ReturnType<typeof renderVisionNodeHeader>, "modelButton">) {
  const modelRail = modelButton.firstElementChild?.firstElementChild;
  const modelChevron = modelButton.querySelector("svg");

  expect(modelRail).toBeTruthy();
  expect(modelRail?.className).toContain("group/setting-tag");
  expect(modelRail?.className).toContain("w-6");
  expect(modelRail?.className).toContain("bg-transparent");
  expect(modelRail?.className).not.toContain("rounded-full");
  expect(modelButton.className).not.toContain("hover:bg-");
  expect(modelButton.className).toContain("w-auto");
  expect(modelButton.className).toContain("max-w-[14rem]");
  expect(modelButton.className).not.toContain("hover:w-[6.5rem]");
  expect(modelButton.firstElementChild?.className).not.toContain("flex-1");
  expect(modelChevron?.getAttribute("class")).toContain("size-3");
  expect(modelChevron?.getAttribute("class")).toContain("text-foreground/36");
  expect(modelButton.textContent).toContain("GPT-4.1 mini");
}

function expectHeaderActionChrome({
  archiveButton,
  previewButton,
  toggleButton,
}: Pick<
  ReturnType<typeof renderVisionNodeHeader>,
  "archiveButton" | "previewButton" | "toggleButton"
>) {
  const headerActions = toggleButton.parentElement as HTMLElement | null;

  expect(headerActions?.contains(toggleButton)).toBe(true);
  expect(headerActions?.contains(previewButton)).toBe(true);
  expect(headerActions?.contains(archiveButton)).toBe(true);
  expect(headerActions?.className).toContain("gap-1");
  expect(headerActions?.className).not.toContain("border-[rgba(0,0,0,0.08)]");
  expect(headerActions?.className).not.toContain("overflow-hidden");
  expect(toggleButton.className).not.toContain("ml-auto");
  expect(toggleButton.className).toContain("size-7");
  expect(toggleButton.className).toContain("rounded-[10px]");
  expect(toggleButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(toggleButton.className).toContain("bg-background");
  expect(toggleButton.className).toContain("hover:bg-[rgba(255,255,255,0.88)]");
  expect(previewButton.className).toContain("size-7");
  expect(previewButton.className).toContain("rounded-[10px]");
  expect(previewButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(previewButton.className).not.toContain("border-l");
  expect(previewButton.className).toContain(
    "hover:bg-[rgba(255,255,255,0.88)]",
  );
  expect(previewButton.className).toContain("disabled:opacity-100");
  expect(archiveButton.className).toContain("size-7");
  expect(archiveButton.className).toContain("rounded-[10px]");
  expect(archiveButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(archiveButton.className).toContain(
    "hover:bg-[rgba(255,255,255,0.88)]",
  );
  expect(archiveButton.getAttribute("aria-disabled")).toBe("true");
  expect(archiveButton.getAttribute("tabindex")).toBe("-1");
  expect(archiveButton.className).toContain("pointer-events-none");
  expect(archiveButton.className).toContain("cursor-default");
  expect(toggleButton.getAttribute("aria-pressed")).toBe("false");
  expect(previewButton.getAttribute("aria-pressed")).toBe("false");
  expect(previewButton.getAttribute("disabled")).toBe("");
}

function expectHeaderActionIcons({
  previewButton,
  toggleButton,
}: Pick<
  ReturnType<typeof renderVisionNodeHeader>,
  "previewButton" | "toggleButton"
>) {
  expect(toggleButton.querySelector("svg")?.getAttribute("class")).toContain(
    "lucide-panel-top-close",
  );
  expect(toggleButton.querySelector("svg")?.getAttribute("class")).toContain(
    "size-4",
  );
  expect(previewButton.querySelector("svg")?.getAttribute("class")).toContain(
    "lucide-focus",
  );
  expect(previewButton.querySelector("svg")?.getAttribute("class")).toContain(
    "size-4",
  );
}

function expectHeaderChrome({
  archiveButton,
  toggleButton,
  modelButton,
  previewButton,
  responseFormatInput,
  titleInput,
  titleControl,
  toolButton,
  temperatureInput,
}: ReturnType<typeof renderVisionNodeHeader>) {
  const headerActions = toggleButton.parentElement as HTMLElement | null;
  const headerRow = headerActions?.parentElement as HTMLElement | null;
  const headerContent = headerRow?.firstElementChild as HTMLElement | null;

  expect(titleControl.className).toContain("bg-[linear-gradient");
  expect(titleControl.contains(modelButton)).toBe(true);
  expect(headerContent?.contains(toolButton)).toBe(true);
  expect(headerContent?.contains(titleInput)).toBe(true);
  expect(headerRow?.lastElementChild).toBe(headerActions);

  expectHeaderActionChrome({ archiveButton, previewButton, toggleButton });
  expectHeaderActionIcons({ previewButton, toggleButton });
  expectHeaderChromeTags({ responseFormatInput, temperatureInput, toolButton });
  expectHeaderChromeModelButton({ modelButton });
}

function expectTitleControlLayout({
  titleInput,
  titleControl,
}: Pick<
  ReturnType<typeof renderVisionNodeHeader>,
  "titleControl" | "titleInput"
>) {
  const titleControlShell = titleControl.parentElement;
  const divider = titleControl.children[1] as HTMLElement | undefined;

  expect(titleControlShell?.className).toContain("max-w-full");
  expect(titleControlShell?.className).toContain("shrink-0");
  expect(titleControl.className).toContain("inline-flex");
  expect(titleInput.className).toContain("w-auto");
  expect(titleInput.className).toContain("[field-sizing:content]");
  expect(titleInput.className).toContain("placeholder:font-normal");
  expect(titleInput.className).toContain("placeholder:text-foreground/40");
  expect(divider?.className).toContain("self-stretch");
  expect(divider?.className).not.toContain("h-[calc(100%-10px)]");
}

describe("SpielwieseAgentNodeHeader strip items", () => {
  it("merges the model picker into the title shell and keeps the reveal labels on the non-model strips", () => {
    const header = renderVisionNodeHeader();

    expectHeaderParamValues(header);
    expectHeaderChrome(header);
    expectTitleControlLayout(header);
  });

  it("keeps the left header controls static on hover while leaving panel actions interactive", () => {
    const { temperatureInput, toggleButton, toolButton } =
      renderVisionNodeHeader();
    const temperatureTag = temperatureInput.parentElement?.firstElementChild as
      | HTMLElement
      | undefined;

    fireEvent.mouseEnter(temperatureTag ?? temperatureInput);

    expect(temperatureTag?.getAttribute("data-state")).toBe("closed");
    expect(toolButton.className).not.toContain("hover:bg-");
    expect(toggleButton.className).toContain(
      "hover:bg-[rgba(255,255,255,0.88)]",
    );
  });

  it("shows only the canonical model name in the header shell when the setting includes a provider suffix", () => {
    const canvas = createCanvasWithVisionModelValue(
      "Claude Haiku 4.5 / Anthropic",
    );

    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const modelButton = within(visionNode).getByRole("button", {
      name: "vision-agent Model",
    });

    expect(
      within(modelButton).getByTestId("spielwiese-provider-mark-anthropic"),
    ).toBeTruthy();
    expect(modelButton.textContent).toContain("Claude Haiku 4.5");
    expect(modelButton.textContent).not.toContain("Anthropic");
  });

  it("refreshes the visible params when the source canvas settings change", () => {
    const reducedSettings =
      spielwieseEditorCanvasTestCanvas.agentNodes[0]!.settings.filter(
        (setting) => setting.id === "model" || setting.id === "temperature",
      );
    const initialCanvas = createCanvasWithVisionSettings(reducedSettings);
    const { rerender } = render(
      <SpielwieseEditorCanvas canvas={initialCanvas} />,
    );

    expect(screen.queryByLabelText("vision-agent Top P")).toBeNull();

    rerender(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    expect(screen.getByLabelText("vision-agent Top P")).toBeTruthy();
    expect(screen.getByLabelText("vision-agent Stop sequence")).toBeTruthy();
    expect(screen.queryByLabelText("vision-agent Response format")).toBeNull();
    expect(screen.getByLabelText("vision-agent Reasoning")).toBeTruthy();
  });
});

describe("SpielwieseAgentNodeHeader empty title state", () => {
  it('shows "Name your agent" as the placeholder when the title is empty', () => {
    render(<SpielwieseEditorCanvas canvas={createCanvasWithVisionTitle("")} />);

    const titleInput = screen.getByLabelText("vision-agent title");

    expect((titleInput as HTMLInputElement).value).toBe("");
    expect(titleInput.getAttribute("placeholder")).toBe("Name your agent");
    expect(titleInput.className).toContain("placeholder:font-normal");
  });
});

describe("SpielwieseAgentNodeHeader model picker popup", () => {
  it("renders the title-shell model picker as an anchored popover panel", () => {
    const header = renderVisionNodeHeader();

    fireEvent.click(header.modelButton);

    const panel = screen.getByRole("dialog", { name: "Model picker" });

    expect(panel.className).not.toContain("absolute");
    expect(panel.className).not.toContain("fixed");
    expect(header.titleControl.contains(panel)).toBe(false);
  });

  it("does not stamp manual inline coordinates onto the panel near the viewport edge", () => {
    const header = renderVisionNodeHeader();
    fireEvent.click(header.modelButton);

    const panel = screen.getByRole("dialog", { name: "Model picker" });

    expect(panel.style.left).toBe("");
    expect(panel.style.top).toBe("");
  });
});
