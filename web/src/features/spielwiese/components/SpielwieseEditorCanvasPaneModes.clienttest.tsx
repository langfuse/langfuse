import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function getPaneModeElements() {
  const paneModeToggle = screen.getByTestId(
    "spielwiese-canvas-pane-mode-toggle",
  );
  const paneModeInfo = screen.getByTestId(
    "spielwiese-canvas-pane-mode-info-affordance",
  );
  const paneModeInfoIcon = screen.getByTestId(
    "spielwiese-canvas-pane-mode-info-icon",
  );
  const paneModeTooltip = screen.getByTestId(
    "spielwiese-canvas-pane-mode-tooltip",
  );
  const paneModeDocsLink = within(paneModeTooltip).getByRole("link", {
    name: "Docs",
  });
  const playgroundToggle = within(paneModeToggle).getByRole("button", {
    name: "Playground",
  });
  const evaluationToggle = within(paneModeToggle).getByRole("button", {
    name: "Evaluation",
  });
  const playgroundHeader = within(
    screen.getByTestId("spielwiese-prompt-simulation-pane"),
  ).getByTestId("spielwiese-playground-header");
  const historyButton = within(playgroundHeader).getByTestId(
    "spielwiese-playground-history-button",
  );
  const playButton = within(playgroundHeader).getByTestId(
    "spielwiese-playground-play-button",
  );

  return {
    paneModeDocsLink,
    paneModeInfo,
    paneModeInfoIcon,
    paneModeTooltip,
    evaluationToggle,
    historyButton,
    paneModeToggle,
    playButton,
    playgroundHeader,
    playgroundToggle,
  };
}

function expectPaneModeSvgSize(button: HTMLElement) {
  expect(button.querySelector("svg")?.getAttribute("class")).toContain(
    "size-3",
  );
}

function expectResizeHandleChrome() {
  const resizeHandle = screen.getByTestId(
    "spielwiese-canvas-pane-resize-handle",
  );
  const restingHandle = within(resizeHandle).getByTestId(
    "spielwiese-resizable-handle-resting-pill",
  );

  expect(resizeHandle.className).toContain("shrink-0");
  expect(resizeHandle.className).toContain("bg-transparent");
  expect(resizeHandle.className).toContain("h-4");
  expect(restingHandle.className).toContain("h-1.5");
  expect(restingHandle.className).toContain("w-10");
  expect(restingHandle.className).toContain("rounded-full");
  expect(restingHandle.className).toContain(
    "group-hover/resize-handle:opacity-0",
  );
  expect(
    within(resizeHandle).queryByTestId("spielwiese-canvas-pane-mode-toggle"),
  ).toBeNull();
}

function expectPlaygroundHeaderChrome(playgroundHeader: HTMLElement) {
  expect(
    within(playgroundHeader).queryByTestId("spielwiese-playground-title"),
  ).toBeNull();
  expect(playgroundHeader.className).toContain("sticky");
  expect(playgroundHeader.className).toContain("bg-[rgba(251,251,251,0.82)]");
  expect(playgroundHeader.className).toContain("backdrop-blur");
}

function expectEvaluationToggleIsInert(evaluationToggle: HTMLElement) {
  expect(evaluationToggle.className).toContain("pointer-events-none");
  expect(evaluationToggle.className).toContain("cursor-default");
  expect(evaluationToggle.getAttribute("aria-disabled")).toBe("true");
  expect(evaluationToggle.getAttribute("tabindex")).toBe("-1");
}

function expectPaneModeToggleButtons({
  evaluationToggle,
  paneModeDocsLink,
  paneModeInfo,
  paneModeInfoIcon,
  paneModeTooltip,
  paneModeToggle,
  playgroundToggle,
}: Pick<
  ReturnType<typeof getPaneModeElements>,
  | "evaluationToggle"
  | "paneModeDocsLink"
  | "paneModeInfo"
  | "paneModeInfoIcon"
  | "paneModeTooltip"
  | "paneModeToggle"
  | "playgroundToggle"
>) {
  expect(paneModeToggle.className).toContain("gap-px");
  expect(paneModeToggle.className).toContain("rounded-[8px]");
  expect(paneModeToggle.className).toContain("bg-[#F7F7F7]");
  expect(paneModeToggle.className).toContain("ring-1");
  expect(paneModeToggle.className).toContain("ring-black/5");
  expect(playgroundToggle.className).toContain("h-6");
  expect(playgroundToggle.className).toContain("min-w-24");
  expect(playgroundToggle.className).toContain("justify-center");
  expect(playgroundToggle.className).toContain("rounded-[8px]");
  expect(playgroundToggle.className).toContain("px-2");
  expect(playgroundToggle.className).toContain("text-[11px]");
  expect(playgroundToggle.className).toContain("py-0");
  expect(playgroundToggle.className).toContain("bg-white");
  expect(playgroundToggle.className).toContain("text-[#202427]");
  expect(playgroundToggle.className).toContain(
    "shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
  );
  expect(evaluationToggle.className).toContain("text-foreground/62");
  expect(evaluationToggle.className).toContain("text-[11px]");
  expect(evaluationToggle.className).toContain("hover:text-foreground");
  expect(evaluationToggle.className).toContain("min-w-24");
  expect(evaluationToggle.className).toContain("justify-center");
  expect(evaluationToggle.className).not.toContain("border-[rgba(0,0,0,0.08)]");
  expectEvaluationToggleIsInert(evaluationToggle);
  expect(paneModeInfo.className).toContain("group/pane-mode-tooltip");
  expect(paneModeInfo.className).toContain("inline-flex");
  expect(paneModeInfo.className).toContain("size-3.5");
  expect(paneModeTooltip.getAttribute("role")).toBe("tooltip");
  expect(paneModeTooltip.textContent).toContain(
    "Playground is for quick, interactive prompt and model iteration.",
  );
  expect(paneModeTooltip.textContent).toContain(
    "Evaluation is for structured scoring, datasets, and repeatable regression checks.",
  );
  expect(paneModeDocsLink.getAttribute("href")).toBe(
    "https://langfuse.com/docs",
  );
  expect(paneModeDocsLink.getAttribute("target")).toBe("_blank");
  expect(paneModeInfoIcon.getAttribute("class")).toContain("size-3");
  expectPaneModeSvgSize(playgroundToggle);
  expectPaneModeSvgSize(evaluationToggle);
}

function expectPaneModeToggleActions({
  evaluationToggle,
  historyButton,
  paneModeToggle,
  playButton,
  playgroundToggle,
}: Pick<
  ReturnType<typeof getPaneModeElements>,
  | "evaluationToggle"
  | "historyButton"
  | "paneModeToggle"
  | "playButton"
  | "playgroundToggle"
>) {
  expect(playgroundToggle.getAttribute("aria-pressed")).toBe("true");
  expect(evaluationToggle.getAttribute("aria-pressed")).toBe("false");
  expectEvaluationToggleIsInert(evaluationToggle);
  expect(historyButton.className).toContain("h-6");
  expect(historyButton.className).toContain("text-[11px]");
  expect(historyButton.className).toContain("rounded-[10px]");
  expect(historyButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(playButton.className).toContain("h-6");
  expect(playButton.className).toContain("text-[11px]");
  expect(playButton.className).toContain("rounded-[10px]");
  expect(playButton.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(within(paneModeToggle).getByText("Playground")).toBeTruthy();
  expect(within(paneModeToggle).getByText("Evaluation")).toBeTruthy();
}

function expectPaneModeToggleChrome({
  evaluationToggle,
  historyButton,
  paneModeDocsLink,
  paneModeInfo,
  paneModeInfoIcon,
  paneModeTooltip,
  paneModeToggle,
  playButton,
  playgroundHeader,
  playgroundToggle,
}: ReturnType<typeof getPaneModeElements>) {
  expectResizeHandleChrome();
  expectPlaygroundHeaderChrome(playgroundHeader);
  expectPaneModeToggleButtons({
    evaluationToggle,
    paneModeDocsLink,
    paneModeInfo,
    paneModeInfoIcon,
    paneModeTooltip,
    paneModeToggle,
    playgroundToggle,
  });
  expectPaneModeToggleActions({
    evaluationToggle,
    historyButton,
    paneModeToggle,
    playButton,
    playgroundToggle,
  });
}

describe("SpielwieseEditorCanvas pane mode toggle chrome", () => {
  it("renders a sticky lower-pane header with the mode toggle and a plain resize line", () => {
    renderCanvas();
    expectPaneModeToggleChrome(getPaneModeElements());
  });
});

describe("SpielwieseEditorCanvas pane mode switching", () => {
  it("keeps evaluation mode inert in the prototype shell", () => {
    renderCanvas();
    const { evaluationToggle } = getPaneModeElements();

    expect(
      screen.getByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-evaluation-pane")).toBeNull();

    fireEvent.click(evaluationToggle);

    expect(
      screen.getByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-evaluation-pane")).toBeNull();
    expect(screen.queryByLabelText("Playground input")).toBeNull();
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-playground")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-evaluation")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
