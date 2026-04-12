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
    evaluationToggle,
    historyButton,
    paneModeToggle,
    playButton,
    playgroundHeader,
    playgroundToggle,
  };
}

function expectEvaluationPaneChrome() {
  const strategyList = screen.getByTestId(
    "spielwiese-evaluation-strategy-list",
  );
  const evaluationPane = screen.getByTestId("spielwiese-evaluation-pane");
  const evaluationPaneShell = screen.getByTestId(
    "spielwiese-evaluation-pane-shell",
  );

  expect(
    screen.getByTestId("spielwiese-evaluation-header-bar").firstElementChild,
  ).toBe(screen.getByTestId("spielwiese-evaluation-header-accessory"));
  expect(evaluationPane).toBeTruthy();
  expect(evaluationPane.className).toContain("px-2");
  expect(evaluationPane.className).toContain("pb-2");
  expect(evaluationPane.className).not.toContain("pt-2");
  expect(evaluationPane.className).not.toContain("px-0");
  expect(evaluationPaneShell.className).toContain("rounded-[8px]");
  expect(evaluationPaneShell.className).not.toContain("rounded-t-[8px]");
  expect(evaluationPaneShell.className).not.toContain("rounded-b-[8px]");
  expect(strategyList).toBeTruthy();
  expect(strategyList.className).toContain("overflow-x-auto");
  expect(strategyList.className).not.toContain("flex-col");
  expect(
    screen.getByTestId("spielwiese-evaluation-strategy-javascript"),
  ).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-evaluation-strategy-javascript").className,
  ).toContain("w-[10rem]");
  expect(
    screen.getByTestId("spielwiese-evaluation-strategy-detail").textContent,
  ).toContain("LLM as a Judge");
  expect(
    screen.getByTestId("spielwiese-evaluation-header-bar").className,
  ).toContain("sticky");
  expect(
    screen.getByTestId("spielwiese-evaluation-header-bar").className,
  ).toContain("backdrop-blur");
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

  expect(resizeHandle.className).toContain("shrink-0");
  expect(resizeHandle.className).toContain("bg-[#F3F3F4]");
  expect(resizeHandle.className).toContain("h-px");
  expect(resizeHandle.className).toContain("hover:ring-1");
  expect(resizeHandle.className).toContain("hover:ring-border/70");
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

function expectPaneModeToggleButtons({
  evaluationToggle,
  paneModeToggle,
  playgroundToggle,
}: Pick<
  ReturnType<typeof getPaneModeElements>,
  "evaluationToggle" | "paneModeToggle" | "playgroundToggle"
>) {
  expect(paneModeToggle.className).toContain("gap-1");
  expect(paneModeToggle.className).not.toContain("bg-[#F7F7F7]");
  expect(paneModeToggle.className).not.toContain("ring-1");
  expect(playgroundToggle.className).toContain("h-6");
  expect(playgroundToggle.className).toContain("rounded-[10px]");
  expect(playgroundToggle.className).toContain("border-[rgba(0,0,0,0.12)]");
  expect(playgroundToggle.className).toContain("pl-1.5");
  expect(playgroundToggle.className).toContain("pr-2");
  expect(playgroundToggle.className).not.toContain("px-3.5");
  expect(playgroundToggle.className).toContain("text-[11px]");
  expect(playgroundToggle.className).toContain("py-0");
  expect(playgroundToggle.className).toContain("bg-background");
  expect(playgroundToggle.className).toContain("text-[#202427]");
  expect(playgroundToggle.className).toContain(
    "shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
  );
  expect(playgroundToggle.className).not.toContain("bg-[linear-gradient");
  expect(evaluationToggle.className).toContain("text-foreground/68");
  expect(evaluationToggle.className).toContain("text-[11px]");
  expect(evaluationToggle.className).toContain("hover:text-foreground");
  expect(evaluationToggle.className).toContain("border-[rgba(0,0,0,0.08)]");
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
  paneModeToggle,
  playButton,
  playgroundHeader,
  playgroundToggle,
}: ReturnType<typeof getPaneModeElements>) {
  expectResizeHandleChrome();
  expectPlaygroundHeaderChrome(playgroundHeader);
  expectPaneModeToggleButtons({
    evaluationToggle,
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
  it("switches the lower pane between playground and evaluation", () => {
    renderCanvas();
    const { evaluationToggle } = getPaneModeElements();

    expect(
      screen.getByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-evaluation-pane")).toBeNull();

    fireEvent.click(evaluationToggle);

    expectEvaluationPaneChrome();

    expect(
      screen.queryByTestId("spielwiese-prompt-simulation-pane"),
    ).toBeNull();
    expect(screen.queryByLabelText("Playground input")).toBeNull();
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-playground")
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("spielwiese-canvas-pane-mode-evaluation")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("SpielwieseEditorCanvas evaluation strategy switching", () => {
  it("lets the user switch between evaluation strategies", () => {
    renderCanvas();
    const { evaluationToggle } = getPaneModeElements();

    fireEvent.click(evaluationToggle);

    const llmJudgeStrategy = screen.getByTestId(
      "spielwiese-evaluation-strategy-llm-judge",
    );
    const javascriptStrategy = screen.getByTestId(
      "spielwiese-evaluation-strategy-javascript",
    );
    const strategyDetail = screen.getByTestId(
      "spielwiese-evaluation-strategy-detail",
    );

    expect(llmJudgeStrategy.getAttribute("aria-pressed")).toBe("true");
    expect(javascriptStrategy.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(javascriptStrategy);

    expect(llmJudgeStrategy.getAttribute("aria-pressed")).toBe("false");
    expect(javascriptStrategy.getAttribute("aria-pressed")).toBe("true");
    expect(strategyDetail.textContent).toContain("JavaScript");
    expect(strategyDetail.textContent).toContain("Write a JavaScript code");
    expect(strategyDetail.textContent).toContain("3 steps");
  });
});
