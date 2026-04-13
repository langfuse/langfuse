import { screen } from "@testing-library/react";

export function mockElementHeights({
  clientHeight,
  element,
  scrollHeight,
}: {
  clientHeight: number;
  element: HTMLElement;
  scrollHeight: number;
}) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
}

function getEvaluationPaneElements() {
  const evaluationPane = screen.getByTestId("spielwiese-evaluation-pane");
  const evaluationPaneShell = screen.getByTestId(
    "spielwiese-evaluation-pane-shell",
  );
  const evaluationPaneSurface = screen.getByTestId(
    "spielwiese-evaluation-pane-surface",
  );
  const evaluationHeaderBar = screen.getByTestId(
    "spielwiese-evaluation-header-bar",
  );
  const strategyList = screen.getByTestId(
    "spielwiese-evaluation-strategy-list",
  );

  return {
    evaluationHeaderBar,
    evaluationPane,
    evaluationPaneShell,
    evaluationPaneSurface,
    strategyList,
  };
}

function expectEvaluationPaneShellChrome({
  evaluationPane,
  evaluationPaneShell,
  evaluationPaneSurface,
}: Pick<
  ReturnType<typeof getEvaluationPaneElements>,
  "evaluationPane" | "evaluationPaneShell" | "evaluationPaneSurface"
>) {
  expect(evaluationPane).toBeTruthy();
  expect(evaluationPane.className).toContain("px-0");
  expect(evaluationPane.className).toContain("pt-0.5");
  expect(evaluationPane.className).toContain("pb-0");
  expect(evaluationPane.className).not.toContain("pt-2");
  expect(evaluationPane.className).not.toContain("px-2");
  expect(evaluationPaneShell.className).toContain(
    "[--canvas-pane-inner-radius:18px]",
  );
  expect(evaluationPaneShell.className).toContain(
    "[--canvas-pane-shell-gap:2px]",
  );
  expect(evaluationPaneShell.className).toContain(
    "rounded-[var(--canvas-pane-outer-radius)]",
  );
  expect(evaluationPaneShell.className).toContain(
    "p-[var(--canvas-pane-shell-gap)]",
  );
  expect(evaluationPaneSurface.className).toContain(
    "rounded-[var(--canvas-pane-inner-radius)]",
  );
  expect(evaluationPaneSurface.className).toContain("relative");
  expect(evaluationPaneSurface.className).toContain("px-2");
  expect(evaluationPaneSurface.className).toContain("pb-[6px]");
  expect(evaluationPaneSurface.className).toContain("after:h-[6px]");
}

function expectEvaluationPaneHeader({
  evaluationHeaderBar,
}: Pick<ReturnType<typeof getEvaluationPaneElements>, "evaluationHeaderBar">) {
  expect(evaluationHeaderBar.firstElementChild).toBe(
    screen.getByTestId("spielwiese-evaluation-header-accessory"),
  );
  expect(evaluationHeaderBar.className).toContain("sticky");
  expect(evaluationHeaderBar.className).toContain("-mx-2");
  expect(evaluationHeaderBar.className).toContain("backdrop-blur");
  expect(evaluationHeaderBar.className).toContain(
    "rounded-t-[var(--canvas-pane-inner-radius)]",
  );
  expect(evaluationHeaderBar.className).toContain("w-[calc(100%+1rem)]");
  expect(evaluationHeaderBar.className).toContain("px-2");
}

function expectEvaluationPaneStrategyChrome({
  strategyList,
}: Pick<ReturnType<typeof getEvaluationPaneElements>, "strategyList">) {
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
}

export function expectEvaluationPaneChrome() {
  const evaluationPaneElements = getEvaluationPaneElements();

  expectEvaluationPaneShellChrome(evaluationPaneElements);
  expectEvaluationPaneHeader(evaluationPaneElements);
  expectEvaluationPaneStrategyChrome(evaluationPaneElements);
}
