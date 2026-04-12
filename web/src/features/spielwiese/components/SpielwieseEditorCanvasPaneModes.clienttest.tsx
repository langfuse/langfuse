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

  return {
    evaluationToggle,
    paneModeToggle,
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

describe("SpielwieseEditorCanvas pane mode toggle chrome", () => {
  it("renders a sticky lower-pane header with the mode toggle and a plain resize line", () => {
    renderCanvas();
    const {
      evaluationToggle,
      paneModeToggle,
      playgroundHeader,
      playgroundToggle,
    } = getPaneModeElements();
    const resizeHandle = screen.getByTestId(
      "spielwiese-canvas-pane-resize-handle",
    );

    expect(
      within(playgroundHeader).queryByTestId("spielwiese-playground-title"),
    ).toBeNull();
    expect(resizeHandle.className).toContain("shrink-0");
    expect(resizeHandle.className).toContain("bg-[#F3F3F4]");
    expect(resizeHandle.className).toContain("h-px");
    expect(resizeHandle.className).toContain("hover:ring-1");
    expect(resizeHandle.className).toContain("hover:ring-border/70");
    expect(
      within(resizeHandle).queryByTestId("spielwiese-canvas-pane-mode-toggle"),
    ).toBeNull();
    expect(playgroundHeader.className).toContain("sticky");
    expect(playgroundHeader.className).toContain("bg-[rgba(251,251,251,0.82)]");
    expect(playgroundHeader.className).toContain("backdrop-blur");
    expect(paneModeToggle.className).toContain("rounded-[11px]");
    expect(paneModeToggle.className).toContain("border-[rgba(0,0,0,0.06)]");
    expect(paneModeToggle.className).toContain("p-0.5");
    expect(paneModeToggle.className).toContain("bg-[rgba(255,255,255,0.52)]");
    expect(paneModeToggle.className).not.toContain("shadow-[");
    expect(playgroundToggle.className).toContain("h-8");
    expect(playgroundToggle.className).toContain("rounded-[8px]");
    expect(playgroundToggle.className).toContain("px-3.5");
    expect(playgroundToggle.className).toContain("text-[0.75rem]");
    expect(playgroundToggle.className).toContain("bg-white");
    expect(playgroundToggle.className).toContain("text-[#202427]");
    expect(playgroundToggle.className).toContain(
      "shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
    );
    expect(playgroundToggle.className).not.toContain("bg-[linear-gradient");
    expect(evaluationToggle.className).toContain("text-foreground/50");
    expect(evaluationToggle.className).toContain("hover:text-foreground/72");
    expect(playgroundToggle.getAttribute("aria-pressed")).toBe("true");
    expect(evaluationToggle.getAttribute("aria-pressed")).toBe("false");
    expect(within(paneModeToggle).getByText("Playground")).toBeTruthy();
    expect(within(paneModeToggle).getByText("Evaluation")).toBeTruthy();
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
