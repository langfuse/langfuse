import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import {
  getOnboardingPersonalDetailsPath,
  getOnboardingStepPath,
  PERSONAL_DETAILS_STEP_ID,
} from "../components/spielwieseOnboardingFlow";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);
const push = jest.fn();
let asPath = "/dev/spielwiese/onboarding";

function mockRouter() {
  mockedUseRouter.mockReturnValue({
    asPath,
    push,
  } as ReturnType<typeof useRouter>);
}

function renderHashStep(stepHashPath: string) {
  asPath = stepHashPath;
  mockRouter();
  return render(<SpielwieseOnboardingPage />);
}

beforeEach(() => {
  push.mockReset();
  asPath = "/dev/spielwiese/onboarding";
  mockRouter();
});

describe("SpielwieseOnboardingPage sign-up basics", () => {
  it("renders the onboarding root as a sign-up screen", () => {
    const { container } = render(<SpielwieseOnboardingPage />);

    expect(screen.getByTestId("spielwiese-onboarding-sign-up")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-onboarding-canvas")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell-header")).toBeNull();
    expect(screen.queryByTestId("spielwiese-left-sidebar")).toBeNull();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("keeps the sign-in button inert but advances on continue", () => {
    render(<SpielwieseOnboardingPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );

    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith(
      getOnboardingPersonalDetailsPath(),
      undefined,
      { scroll: false, shallow: true },
    );
  });
});

describe("SpielwieseOnboardingPage personal details entry", () => {
  it("renders the personal details route without dashboard shell chrome", () => {
    const { container } = renderHashStep(getOnboardingPersonalDetailsPath());

    expect(
      screen.getByTestId("spielwiese-onboarding-personal-details"),
    ).toBeTruthy();
    expect(screen.getByText("Let's get to know you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-onboarding-canvas")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("advances from personal details into the first onboarding question", () => {
    renderHashStep(getOnboardingPersonalDetailsPath());

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith(getOnboardingStepPath("role"));
  });

  it("still supports the legacy personal details step slug", () => {
    render(<SpielwieseOnboardingPage stepId={PERSONAL_DETAILS_STEP_ID} />);

    expect(
      screen.getByTestId("spielwiese-onboarding-personal-details"),
    ).toBeTruthy();
  });

  it("renders the updated footer copy and designer hover caption", () => {
    render(<SpielwieseOnboardingPage />);

    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("yes i designed this lol")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-wordmark-hover-zone"),
    ).toBeTruthy();
  });
});

describe("SpielwieseOnboardingPage routed steps", () => {
  it("renders the interactive onboarding route without dashboard shell chrome", () => {
    const { container } = render(<SpielwieseOnboardingPage stepId="role" />);

    expect(screen.getByTestId("spielwiese-onboarding-canvas")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeTruthy();
    expect(screen.getByText("Hello Leonard")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell-header")).toBeNull();
    expect(screen.queryByTestId("spielwiese-left-sidebar")).toBeNull();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("keeps the first question active until earlier answers exist", () => {
    render(<SpielwieseOnboardingPage stepId="intent" />);

    expect(screen.getByText("Question 1 of 3")).toBeTruthy();
    expect(screen.getByText("What describes you best?")).toBeTruthy();
    expect(screen.queryByText("Why are you opening this room?")).toBeNull();
  });
});
