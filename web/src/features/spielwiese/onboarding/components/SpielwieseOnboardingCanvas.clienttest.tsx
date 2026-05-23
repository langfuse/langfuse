/* eslint-disable max-lines */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useRouter } from "next/router";
import "../../components/spielwieseResizableTestMock";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";
import {
  consumeOnboardingDashboardHandoff,
  resetOnboardingDashboardHandoffForTests,
} from "../spielwieseOnboardingDashboardHandoff";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);
const push = jest.fn();

function renderOnboardingCanvas(requestedStepId?: string) {
  return render(
    <SpielwieseOnboardingCanvas requestedStepId={requestedStepId} />,
  );
}

function getStepLayer() {
  return screen.getByTestId("spielwiese-onboarding-step-layer");
}

async function completeSceneExit(stepLayer: HTMLElement) {
  await act(async () => {
    fireEvent.animationEnd(stepLayer, {
      animationName: "spielwiese-onboarding-scene-exit",
    });
    await Promise.resolve();
  });
}

function expectVisibleQuestion({ prompt }: { prompt: string }) {
  expect(screen.getByText(prompt)).toBeTruthy();
}

function expectSurfaceShellChrome(expectedShellWidthClassName: string) {
  const surfaceShell = screen.getByTestId(
    "spielwiese-onboarding-surface-shell",
  );
  const questionPanel = screen.getByTestId(
    "spielwiese-onboarding-question-panel",
  );
  const progressBar = screen.getByRole("progressbar");

  expect(surfaceShell.className).toContain(expectedShellWidthClassName);
  expect(surfaceShell.className).toContain("flex");
  expect(surfaceShell.className).toContain("items-center");
  expect(surfaceShell.className).toContain("bg-transparent");
  expect(surfaceShell.className).toContain("shadow-none");
  expect(surfaceShell.className).toContain("border-0");
  expect(questionPanel.className).not.toContain("bg-white");
  expect(questionPanel.className).toContain("bg-transparent");
  expect(questionPanel.className).toContain("shadow-none");
  expect(questionPanel.className).toContain("w-full");
  expect(questionPanel.className).toContain("border-0");
  expect(questionPanel.className).toContain("animate-in");
  expect(progressBar.getAttribute("aria-valuenow")).not.toBe("12.5");
  expect(
    screen.queryByTestId("spielwiese-canvas-editor-mode-header"),
  ).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-agent-node-insert-footer"),
  ).toBeNull();
  expect(screen.queryByTestId("spielwiese-canvas-bottom-panel")).toBeNull();
  expect(screen.queryByTestId("spielwiese-prompt-simulation-pane")).toBeNull();
}

function expectQuestionOptionsLayout() {
  const optionsLayout = screen.getByTestId(
    "spielwiese-onboarding-options-layout",
  );

  expect(optionsLayout.className).toContain("grid-cols-2");
}

function expectNoLegacyQuestionnaireChrome() {
  expect(screen.queryByTestId("spielwiese-onboarding-greeting")).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-onboarding-questionnaire"),
  ).toBeNull();
  expect(screen.queryByText("Direction")).toBeNull();
  expect(
    screen.queryByText(
      "A better room starts by knowing how much direction to give you.",
    ),
  ).toBeNull();
  expect(
    screen.queryByText(
      "If you already know what to build, the room can stay out of your way. If you do not, it should help shape the path before it asks for precision.",
    ),
  ).toBeNull();
  expect(screen.queryByText("Current answer")).toBeNull();
  expect(screen.queryByText("Why are you opening this room?")).toBeNull();
  expect(screen.queryByText("What should feel strongest first?")).toBeNull();
  expect(screen.queryByTestId("spielwiese-onboarding-step-label")).toBeNull();
}

function expectSharedChromeOutsideStepLayer() {
  expect(
    screen.queryByRole("button", {
      name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
    }),
  ).toBeNull();
}

function expectRoleGateState() {
  expect(screen.getByTestId("spielwiese-onboarding-step")).toBeTruthy();
  expect(screen.getByTestId("spielwiese-onboarding-step-layer")).toBeTruthy();
  expect(
    screen.queryByTestId("spielwiese-onboarding-surface-backdrop"),
  ).toBeNull();
  expectSurfaceShellChrome("max-w-[35rem]");
  expectQuestionOptionsLayout();
  expectSharedChromeOutsideStepLayer();
  expectNoLegacyQuestionnaireChrome();
  expectVisibleQuestion({
    prompt: "Do you know what to build?",
  });
  expect(
    screen.queryByText(
      "Pick the closest answer. We can tune the room from there.",
    ),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "No" }).getAttribute("disabled"),
  ).not.toBeNull();
  expect(screen.queryByTestId("spielwiese-onboarding-upper-canvas")).toBeNull();
}

function expectRoleBridgeCopyState() {
  expect(
    screen.getByTestId("spielwiese-onboarding-role-bridge-copy"),
  ).toBeTruthy();
  expect(screen.getByText("Then let's jump right in")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
}

function expectRolePreviewCanvasCentering() {
  const agentNodeStack = screen.getByTestId("spielwiese-agent-node-stack");
  const roleCanvasWrap = screen.getByTestId(
    "spielwiese-onboarding-role-canvas-wrap",
  );
  const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
  const upperCanvasFrame = screen.getByTestId(
    "spielwiese-onboarding-upper-canvas-frame",
  );

  expect(roleCanvasWrap.className).toContain("mx-auto");
  expect(roleCanvasWrap.className).toContain("w-full");
  expect(upperCanvasFrame.className).not.toContain("h-[30rem]");
  expect(upperCanvasFrame.className).not.toContain("md:h-[32rem]");
  expect(agentNodeStack.className).not.toContain("min-h-full");
  expect(visionNode.className).not.toContain("last:pb-5");
}

function revealRolePreview() {
  fireEvent.animationEnd(
    screen.getByTestId("spielwiese-onboarding-role-bridge-copy"),
  );

  const roleCopyBlock = screen.getByTestId(
    "spielwiese-onboarding-role-copy-block",
  );

  expect(screen.getByTestId("spielwiese-onboarding-upper-canvas")).toBeTruthy();
  expect(screen.getByTestId("spielwiese-editor-canvas-pane")).toBeTruthy();
  expectSurfaceShellChrome("max-w-[64rem]");
  expectSharedChromeOutsideStepLayer();
  expectRolePreviewCanvasCentering();
  expect(screen.queryByText("Do you know what to build?")).toBeNull();
  expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "No" })).toBeNull();
  expect(
    screen.getByText("Insert how you want your model to behave."),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'For example "Act as if you were a senior business strategist".',
    ),
  ).toBeTruthy();
  expect(roleCopyBlock.className).toContain("max-w-[44rem]");
  expect(screen.getByLabelText("vision-agent Instructions")).toBeTruthy();
  expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /continue/i }).className).toContain(
    "max-w-[23.25rem]",
  );
  expect(
    screen.getByRole("button", { name: "vision-agent Model" }).textContent,
  ).toContain("Claude Opus 4.6");
  expect(
    screen
      .getByRole("button", { name: "vision-agent Model" })
      .getAttribute("disabled"),
  ).not.toBeNull();
  expect(screen.queryByLabelText("vision-agent title")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create tool" })).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-agent-node-header-actions"),
  ).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-response-format-composer"),
  ).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-agent-node-card-back-button"),
  ).toBeNull();
  expect(
    screen.queryByTestId("spielwiese-agent-node-card-add-button"),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: /continue/i }).getAttribute("disabled"),
  ).not.toBeNull();
}

function expectRoleModelSelectionState() {
  const upperCanvasFrame = screen.getByTestId(
    "spielwiese-onboarding-upper-canvas-frame",
  );
  const continueRow = screen.getByTestId(
    "spielwiese-onboarding-role-continue-row",
  );

  expect(
    screen.getByText("Choose the model you want to start with."),
  ).toBeTruthy();
  expect(
    screen.getByText("We will stay in the Claude family for this demo."),
  ).toBeTruthy();
  expect(upperCanvasFrame.className).not.toContain("h-[30rem]");
  expect(upperCanvasFrame.className).not.toContain("md:h-[32rem]");
  expect(continueRow.className).toContain("max-w-[23.25rem]");
  expect(continueRow.className).toContain("min-h-9");
  expect(
    screen.getByTestId("spielwiese-onboarding-role-continue-placeholder"),
  ).toBeTruthy();
  expect(
    screen.queryByTestId("spielwiese-model-picker-api-key-pane"),
  ).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Model picker" })).toBeNull();
  expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
}

function expectRoleApiKeyState() {
  const upperCanvasFrame = screen.getByTestId(
    "spielwiese-onboarding-upper-canvas-frame",
  );
  const continueRow = screen.getByTestId(
    "spielwiese-onboarding-role-continue-row",
  );
  const panel = screen.getByRole("dialog", { name: "Model picker" });

  expect(screen.getByText("Add your Anthropic API key.")).toBeTruthy();
  expect(upperCanvasFrame.className).not.toContain("h-[30rem]");
  expect(upperCanvasFrame.className).not.toContain("md:h-[32rem]");
  expect(continueRow.className).toContain("max-w-[23.25rem]");
  expect(continueRow.className).not.toContain("-top-[100px]");
  expect(
    screen.queryByTestId("spielwiese-onboarding-api-key-inline-fields"),
  ).toBeNull();
  expect(
    screen.getByTestId("spielwiese-onboarding-role-continue-placeholder"),
  ).toBeTruthy();
  expect(
    within(panel).getByTestId("spielwiese-model-picker-api-key-pane"),
  ).toBeTruthy();
  expect(
    within(panel).getByText(/Connect .* with your Anthropic key\./i).className,
  ).toContain("text-[0.8125rem]/5");
  expect(
    within(panel).getByRole("link", { name: "Link" }).getAttribute("href"),
  ).toBe("https://console.anthropic.com/settings/keys");
  expect(
    within(panel).getByTestId("spielwiese-model-picker-api-key-row").className,
  ).toContain("grid");
  expect(continueRow.className).toContain("justify-center");
  expect(
    within(panel).getByRole("button", { name: /continue/i }).className,
  ).toContain("bg-[rgba(244,244,245,0.96)]");
  expect(
    within(panel)
      .getByRole("button", { name: /continue/i })
      .getAttribute("disabled"),
  ).not.toBeNull();
  expect(
    within(panel)
      .getByTestId("spielwiese-model-picker-api-key-pane")
      .style.getPropertyValue("--spielwiese-picker-pane-delay"),
  ).toBe("1070ms");
  expect(panel.style.getPropertyValue("--spielwiese-picker-open-delay")).toBe(
    "1070ms",
  );
  expect(
    within(panel).getByLabelText("Anthropic API key").getAttribute("type"),
  ).toBe("password");
  expect(within(panel).getByRole("button", { name: /continue/i })).toBeTruthy();
}

beforeEach(() => {
  push.mockReset();
  resetOnboardingDashboardHandoffForTests();
  window.history.replaceState({}, "", "/dev/spielwiese/onboarding/role");
  mockedUseRouter.mockReturnValue({
    push,
  } as ReturnType<typeof useRouter>);
});

afterEach(() => {
  jest.useRealTimers();
});

it("renders the first onboarding step as a gated role question before the preview reveal", () => {
  renderOnboardingCanvas("role");
  expectRoleGateState();
});

// eslint-disable-next-line max-lines-per-function
it("reveals the role preview, stages model selection, and then resumes the routed flow", async () => {
  jest.useFakeTimers();
  renderOnboardingCanvas("role");
  const stepLayer = getStepLayer();

  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  expect(push).not.toHaveBeenCalled();
  expect(stepLayer.className).toContain(
    "animate-spielwiese-onboarding-scene-exit",
  );
  expect(screen.queryByTestId("spielwiese-onboarding-upper-canvas")).toBeNull();

  await completeSceneExit(stepLayer);
  expectRoleBridgeCopyState();
  revealRolePreview();

  fireEvent.change(screen.getByLabelText("vision-agent Instructions"), {
    target: {
      value: "Act as if you were a senior business strategist",
    },
  });
  expect(
    screen.getByRole("button", { name: /continue/i }).getAttribute("disabled"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expectRoleModelSelectionState();
  fireEvent.transitionEnd(screen.getByTestId("spielwiese-agent-title-control"));
  expect(screen.getByRole("dialog", { name: "Model picker" })).toBeTruthy();
  expect(
    screen
      .getByRole("dialog", { name: "Model picker" })
      .style.getPropertyValue("--spielwiese-picker-open-delay"),
  ).toBe("890ms");

  fireEvent.click(screen.getByRole("button", { name: "Claude Opus 4.6" }));
  expectRoleApiKeyState();
  fireEvent.change(
    within(screen.getByRole("dialog", { name: "Model picker" })).getByLabelText(
      "Anthropic API key",
    ),
    {
      target: {
        value: "sk-ant-api03-demo",
      },
    },
  );
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Model picker" })).getByRole(
      "button",
      { name: /continue/i },
    ),
  );
  expect(stepLayer.className).not.toContain(
    "animate-spielwiese-onboarding-scene-exit",
  );
  expect(consumeOnboardingDashboardHandoff()).toEqual(
    expect.objectContaining({
      modelValue: "Claude Opus 4.6",
      systemPromptValue: "Act as if you were a senior business strategist",
      transitionKind: "role-flow",
    }),
  );
  expect(push).toHaveBeenLastCalledWith(
    "/dev/spielwiese/dashboard",
    undefined,
    {
      shallow: true,
    },
  );
});

it("ignores legacy role handoff debug params when moving into the dashboard", async () => {
  jest.useFakeTimers();
  window.history.replaceState(
    {},
    "",
    "/dev/spielwiese/onboarding/role?debugRoleLiftY=88&debugFreezeRoleHandoff=1",
  );
  renderOnboardingCanvas("role");

  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await completeSceneExit(getStepLayer());
  revealRolePreview();

  fireEvent.change(screen.getByLabelText("vision-agent Instructions"), {
    target: {
      value: "Act as if you were a senior business strategist",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.transitionEnd(screen.getByTestId("spielwiese-agent-title-control"));
  fireEvent.click(screen.getByRole("button", { name: "Claude Opus 4.6" }));
  fireEvent.change(
    within(screen.getByRole("dialog", { name: "Model picker" })).getByLabelText(
      "Anthropic API key",
    ),
    {
      target: {
        value: "sk-ant-api03-demo",
      },
    },
  );
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Model picker" })).getByRole(
      "button",
      { name: /continue/i },
    ),
  );

  expect(
    screen.queryByTestId("spielwiese-onboarding-role-dashboard-handoff"),
  ).toBeNull();
  expect(push).toHaveBeenLastCalledWith(
    "/dev/spielwiese/dashboard?debugRoleLiftY=88&debugFreezeRoleHandoff=1",
    undefined,
    {
      shallow: true,
    },
  );
});
