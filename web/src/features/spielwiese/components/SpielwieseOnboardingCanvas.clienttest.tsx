import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);
const push = jest.fn();
const onboardingCanvas = {
  greeting: "Hello Leonard",
};

function renderOnboardingCanvas(requestedStepId?: string) {
  return render(
    <SpielwieseOnboardingCanvas
      onboardingCanvas={onboardingCanvas}
      requestedStepId={requestedStepId}
    />,
  );
}

describe("SpielwieseOnboardingCanvas setup", () => {
  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
    } as ReturnType<typeof useRouter>);
  });

  it("renders one onboarding question at a time with a persistent placeholder", () => {
    renderOnboardingCanvas();

    expect(screen.getByTestId("spielwiese-onboarding-canvas")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-onboarding-greeting")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-questionnaire"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-placeholder"),
    ).toBeTruthy();
    expect(screen.getByText("Question 1 of 3")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Onboarding progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("1");
    expect(screen.getByText("What describes you best?")).toBeTruthy();
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
    const { rerender } = renderOnboardingCanvas();

    fireEvent.click(screen.getByRole("button", { name: "Builder" }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(push).toHaveBeenLastCalledWith(
      "/dev/spielwiese/onboarding/intent",
      undefined,
      { shallow: true },
    );

    rerender(
      <SpielwieseOnboardingCanvas
        onboardingCanvas={onboardingCanvas}
        requestedStepId="intent"
      />,
    );
    expect(screen.getByText("Question 2 of 3")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Onboarding progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("2");
    expect(screen.getByText("Why are you opening this room?")).toBeTruthy();
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
        onboardingCanvas={onboardingCanvas}
        requestedStepId="opening"
      />,
    );
    expect(screen.getByText("Question 3 of 3")).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Onboarding progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("3");
    expect(screen.getByText("What should feel strongest first?")).toBeTruthy();
    expect(screen.queryByText("Why are you opening this room?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guidance" }));
    fireEvent.click(screen.getByRole("button", { name: /open the canvas/i }));

    expect(push).toHaveBeenLastCalledWith("/dev/spielwiese", undefined, {
      shallow: true,
    });
  });
});
