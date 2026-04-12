import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);
const push = jest.fn();
const dashboard = getSpielwieseDashboardVm("assistant");
const onboardingCanvas = dashboard.onboardingCanvas!;
const canvas = dashboard.canvas;

function renderOnboardingCanvas(requestedStepId?: string) {
  return render(
    <SpielwieseOnboardingCanvas
      canvas={canvas}
      onboardingCanvas={onboardingCanvas}
      requestedStepId={requestedStepId}
    />,
  );
}

function expectVisibleQuestion({
  progressStep,
  prompt,
}: {
  progressStep: number;
  prompt: string;
}) {
  expect(screen.getByText(`Question ${progressStep} of 3`)).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Onboarding progress" })
      .getAttribute("aria-valuenow"),
  ).toBe(String(progressStep));
  expect(screen.getByText(prompt)).toBeTruthy();
}

describe("SpielwieseOnboardingCanvas setup", () => {
  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
    } as ReturnType<typeof useRouter>);
  });

  it("renders one onboarding question at a time above the live upper canvas", () => {
    renderOnboardingCanvas("role");

    expect(screen.getByTestId("spielwiese-onboarding-canvas")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-onboarding-greeting")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-questionnaire"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-onboarding-placeholder"),
    ).toBeNull();
    expect(screen.getByTestId("spielwiese-editor-canvas-pane")).toBeTruthy();
    expectVisibleQuestion({
      progressStep: 1,
      prompt: "What describes you best?",
    });
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

  it("moves through the current questions and opens the canvas at the end", () => {
    const { rerender } = renderOnboardingCanvas("role");

    fireEvent.click(screen.getByRole("button", { name: "Builder" }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(push).toHaveBeenLastCalledWith(
      "/dev/spielwiese/onboarding/intent",
      undefined,
      { shallow: true },
    );

    rerender(
      <SpielwieseOnboardingCanvas
        canvas={canvas}
        onboardingCanvas={onboardingCanvas}
        requestedStepId="intent"
      />,
    );
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

    rerender(
      <SpielwieseOnboardingCanvas
        canvas={canvas}
        onboardingCanvas={onboardingCanvas}
        requestedStepId="opening"
      />,
    );
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
