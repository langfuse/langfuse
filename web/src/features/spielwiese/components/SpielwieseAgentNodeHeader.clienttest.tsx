import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderVisionNodeHeader() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);

  const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
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
  const toggleButton = within(visionNode).getByRole("button", {
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
}

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
  expect(temperatureTag?.className).toContain("hover:w-[6.5rem]");
  expect(toolTag?.className).toContain("hover:w-[4rem]");
  expect(temperatureTag?.textContent).toContain("Temperature");
  expect(toolTag?.textContent).toContain("Tools");
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
  expect(modelButton.className).toContain("hover:bg-transparent");
  expect(modelButton.className).toContain("w-auto");
  expect(modelButton.className).toContain("max-w-[14rem]");
  expect(modelButton.className).not.toContain("hover:w-[6.5rem]");
  expect(modelButton.firstElementChild?.className).not.toContain("flex-1");
  expect(modelChevron?.getAttribute("class")).toContain("size-3");
  expect(modelChevron?.getAttribute("class")).toContain("text-foreground/36");
  expect(modelButton.textContent).toContain("GPT-4.1 mini");
}

function expectHeaderChrome({
  toggleButton,
  modelButton,
  responseFormatInput,
  titleInput,
  titleControl,
  toolButton,
  temperatureInput,
}: ReturnType<typeof renderVisionNodeHeader>) {
  const headerRow = toggleButton.parentElement;
  const headerContent = headerRow?.firstElementChild as HTMLElement | null;

  expect(titleControl.className).toContain("bg-[linear-gradient");
  expect(titleControl.contains(modelButton)).toBe(true);
  expect(headerContent?.contains(toolButton)).toBe(true);
  expect(headerContent?.contains(titleInput)).toBe(true);
  expect(headerRow?.lastElementChild).toBe(toggleButton);
  expect(toggleButton.className).not.toContain("ml-auto");
  expect(toggleButton.getAttribute("aria-pressed")).toBe("false");

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
