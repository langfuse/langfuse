import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";

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
  expect(surfaceShell.className).toContain("bg-transparent");
  expect(surfaceShell.className).toContain("shadow-none");
  expect(surfaceShell.className).toContain("border-0");
  expect(questionPanel.className).not.toContain("bg-white");
  expect(questionPanel.className).toContain("bg-transparent");
  expect(questionPanel.className).toContain("shadow-none");
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
  const stepLayer = getStepLayer();
  const wordmarkButton = screen.getByRole("button", { name: "Langfuse" });
  const imprintButton = screen.getByRole("button", {
    name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
  });

  expect(stepLayer.contains(wordmarkButton)).toBe(false);
  expect(stepLayer.contains(imprintButton)).toBe(false);
}

function expectRoleGateState() {
  expect(screen.getByTestId("spielwiese-onboarding-step")).toBeTruthy();
  expect(screen.getByTestId("spielwiese-onboarding-step-layer")).toBeTruthy();
  expect(
    screen.queryByTestId("spielwiese-onboarding-surface-backdrop"),
  ).toBeNull();
  expectSurfaceShellChrome("max-w-[36rem]");
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

function revealRolePreview() {
  fireEvent.animationEnd(
    screen.getByTestId("spielwiese-onboarding-role-bridge-copy"),
  );

  expect(screen.getByTestId("spielwiese-onboarding-upper-canvas")).toBeTruthy();
  expect(screen.getByTestId("spielwiese-editor-canvas-pane")).toBeTruthy();
  expectSurfaceShellChrome("max-w-[70.625rem]");
  expectSharedChromeOutsideStepLayer();
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
  expect(screen.getByLabelText("vision-agent Instructions")).toBeTruthy();
  expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "vision-agent Model" }).textContent,
  ).toContain("Claude Opus 4.6");
  expect(screen.queryByLabelText("vision-agent title")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create tool" })).toBeNull();
  expect(screen.queryByTestId("spielwiese-agent-node-header-actions")).toBeNull();
  expect(screen.queryByTestId("spielwiese-response-format-composer")).toBeNull();
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

function expectIntentFallbackState() {
  expectVisibleQuestion({
    prompt: "Why are you opening this room?",
  });
  expect(
    screen.getByTestId("spielwiese-onboarding-surface-shell").className,
  ).toContain("max-w-[36rem]");
  expect(screen.queryByTestId("spielwiese-onboarding-upper-canvas")).toBeNull();
  expect(screen.queryByText("What describes you best?")).toBeNull();
}

beforeEach(() => {
  push.mockReset();
  mockedUseRouter.mockReturnValue({
    push,
  } as ReturnType<typeof useRouter>);
});

it("renders the first onboarding step as a gated role question before the preview reveal", () => {
  renderOnboardingCanvas("role");
  expectRoleGateState();
});

it("reveals the role preview only after the bridge copy finishes and then resumes the routed flow", async () => {
  const { rerender } = renderOnboardingCanvas("role");
  let stepLayer = getStepLayer();

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
  expect(stepLayer.className).toContain(
    "animate-spielwiese-onboarding-scene-exit",
  );
  await completeSceneExit(stepLayer);

  expect(push).toHaveBeenLastCalledWith(
    "/dev/spielwiese/onboarding/intent",
    undefined,
    { shallow: true },
  );

  rerender(<SpielwieseOnboardingCanvas requestedStepId="intent" />);
  stepLayer = getStepLayer();
  expectIntentFallbackState();

  fireEvent.click(screen.getByRole("button", { name: "Shape a workflow" }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(stepLayer.className).toContain(
    "animate-spielwiese-onboarding-scene-exit",
  );
  await completeSceneExit(stepLayer);

  expect(push).toHaveBeenLastCalledWith(
    "/dev/spielwiese/onboarding/opening",
    undefined,
    { shallow: true },
  );

  rerender(<SpielwieseOnboardingCanvas requestedStepId="opening" />);
  stepLayer = getStepLayer();
  expectVisibleQuestion({
    prompt: "What should feel strongest first?",
  });
  expect(screen.queryByText("Why are you opening this room?")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Guidance" }));
  fireEvent.click(screen.getByRole("button", { name: /open dashboard/i }));
  expect(stepLayer.className).toContain(
    "animate-spielwiese-onboarding-scene-exit",
  );
  await completeSceneExit(stepLayer);

  expect(push).toHaveBeenLastCalledWith(
    "/dev/spielwiese/dashboard",
    undefined,
    {
      shallow: true,
    },
  );
});
