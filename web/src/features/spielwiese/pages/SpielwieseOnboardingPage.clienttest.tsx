import { render, screen } from "@testing-library/react";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

describe("SpielwieseOnboardingPage", () => {
  it("renders the onboarding route without dashboard shell chrome", () => {
    const { container } = render(<SpielwieseOnboardingPage />);

    expect(screen.getByTestId("spielwiese-onboarding-canvas")).toBeTruthy();
    expect(screen.getByText("Hello Leonard")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell-header")).toBeNull();
    expect(screen.queryByTestId("spielwiese-left-sidebar")).toBeNull();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });
});
