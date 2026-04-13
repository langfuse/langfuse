import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";
import { onboardingStepCopy } from "./spielwieseOnboardingStepCopy";

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

function expectVisibleQuestion({
  progressStep,
  prompt,
}: {
  progressStep: number;
  prompt: string;
}) {
  expect(
    screen.getByTestId("spielwiese-onboarding-step-label").textContent,
  ).toBe(`Question ${progressStep} of 3`);
  expect(screen.getByText(prompt)).toBeTruthy();
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
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("max-w-[36rem]");
    expect(screen.getByRole("button", { name: "Langfuse" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-onboarding-greeting")).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-onboarding-questionnaire"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeNull();
    expectVisibleQuestion({
      progressStep: 1,
      prompt: "Do you know what to build?",
    });
    expect(screen.queryByText(onboardingStepCopy.role.eyebrow)).toBeNull();
    expect(screen.queryByText(onboardingStepCopy.role.title)).toBeNull();
    expect(screen.queryByText(onboardingStepCopy.role.body)).toBeNull();
    expect(screen.queryByText("Current answer")).toBeNull();
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
    expect(screen.queryByText("Why are you opening this room?")).toBeNull();
    expect(screen.queryByText("What should feel strongest first?")).toBeNull();
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
      progressStep: 2,
      prompt: "Why are you opening this room?",
    });
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
      progressStep: 3,
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
