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

export function expectEvaluationPaneChrome() {
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
  expect(evaluationPane.className).toContain("px-0");
  expect(evaluationPane.className).toContain("pb-0");
  expect(evaluationPane.className).not.toContain("pt-2");
  expect(evaluationPane.className).not.toContain("px-2");
  expect(evaluationPaneShell.className).toContain("rounded-[8px]");
  expect(evaluationPaneShell.className).toContain("relative");
  expect(evaluationPaneShell.className).toContain("pb-[6px]");
  expect(evaluationPaneShell.className).toContain("after:h-[6px]");
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
  expect(
    screen.getByTestId("spielwiese-evaluation-header-bar").className,
  ).toContain("rounded-t-[8px]");
  expect(
    screen.getByTestId("spielwiese-evaluation-header-bar").className,
  ).toContain("pl-[13px]");
}
