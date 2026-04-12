import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);

describe("SpielwieseOnboardingPage", () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockReset();
    mockedUseRouter.mockReturnValue({
      push,
    } as ReturnType<typeof useRouter>);
  });

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

  it("keeps the sign-up buttons inert", () => {
    render(<SpielwieseOnboardingPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).not.toHaveBeenCalled();
  });

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
