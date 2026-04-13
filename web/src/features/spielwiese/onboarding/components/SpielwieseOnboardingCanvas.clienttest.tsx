import { fireEvent, render, screen } from "@testing-library/react";
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

function expectVisibleQuestion({ prompt }: { prompt: string }) {
  expect(screen.getByText(prompt)).toBeTruthy();
}

function expectFlatQuestionChrome() {
  const surfaceShell = screen.getByTestId(
    "spielwiese-onboarding-surface-shell",
  );
  const questionPanel = screen.getByTestId(
    "spielwiese-onboarding-question-panel",
  );
  const optionsLayout = screen.getByTestId(
    "spielwiese-onboarding-options-layout",
  );
  const progressBar = screen.getByRole("progressbar");

  expect(surfaceShell.className).toContain("max-w-[70.625rem]");
  expect(surfaceShell.className).toContain("bg-transparent");
  expect(surfaceShell.className).toContain("shadow-none");
  expect(surfaceShell.className).toContain("border-0");
  expect(questionPanel.className).not.toContain("bg-white");
  expect(questionPanel.className).toContain("bg-transparent");
  expect(questionPanel.className).toContain("shadow-none");
  expect(questionPanel.className).toContain("border-0");
  expect(questionPanel.className).toContain("animate-in");
  expect(optionsLayout.className).toContain("grid-cols-2");
  expect(progressBar.getAttribute("aria-valuenow")).not.toBe("12.5");
  expect(screen.queryByTestId("spielwiese-canvas-editor-mode-header")).toBeNull();
  expect(screen.queryByTestId("spielwiese-agent-node-insert-footer")).toBeNull();
  expect(screen.queryByTestId("spielwiese-canvas-bottom-panel")).toBeNull();
  expect(screen.queryByTestId("spielwiese-prompt-simulation-pane")).toBeNull();
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

describe("SpielwieseOnboardingCanvas setup", () => {
  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
    } as ReturnType<typeof useRouter>);
  });

  it("renders the first onboarding step as a simple centered yes or no question", () => {
    renderOnboardingCanvas("role");

    expect(screen.getByTestId("spielwiese-onboarding-step")).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-onboarding-surface-backdrop"),
    ).toBeNull();
    expectFlatQuestionChrome();
    expect(screen.getByRole("button", { name: "Langfuse" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expectNoLegacyQuestionnaireChrome();
    expect(
      screen.getByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeTruthy();
    expect(screen.getByTestId("spielwiese-editor-canvas-pane")).toBeTruthy();
    expectVisibleQuestion({
      prompt: "Do you know what to build?",
    });
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
  });
});

describe("SpielwieseOnboardingCanvas sequence", () => {
  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
    } as ReturnType<typeof useRouter>);
  });

  it("moves through the current questions and opens the dashboard at the end", () => {
    const { rerender } = renderOnboardingCanvas("role");

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(push).toHaveBeenLastCalledWith(
      "/dev/spielwiese/onboarding/intent",
      undefined,
      { shallow: true },
    );

    rerender(<SpielwieseOnboardingCanvas requestedStepId="intent" />);
    expectVisibleQuestion({
      prompt: "Why are you opening this room?",
    });
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("max-w-[36rem]");
    expect(
      screen.queryByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeNull();
    expect(screen.queryByText("What describes you best?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Shape a workflow" }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(push).toHaveBeenLastCalledWith(
      "/dev/spielwiese/onboarding/opening",
      undefined,
      { shallow: true },
    );

    rerender(<SpielwieseOnboardingCanvas requestedStepId="opening" />);
    expectVisibleQuestion({
      prompt: "What should feel strongest first?",
    });
    expect(screen.queryByText("Why are you opening this room?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guidance" }));
    fireEvent.click(screen.getByRole("button", { name: /open dashboard/i }));

    expect(push).toHaveBeenLastCalledWith(
      "/dev/spielwiese/dashboard",
      undefined,
      {
        shallow: true,
      },
    );
  });
});
