import { render, screen } from "@testing-library/react";
import { SpielwieseOnboardingCanvas } from "./SpielwieseOnboardingCanvas";

describe("SpielwieseOnboardingCanvas", () => {
  const onboardingCanvas = {
    greeting: "Hello Leonard",
  };

  it("renders the greeting above the placeholder area", () => {
    render(<SpielwieseOnboardingCanvas onboardingCanvas={onboardingCanvas} />);

    const canvas = screen.getByTestId("spielwiese-onboarding-canvas");
    const greeting = screen.getByTestId("spielwiese-onboarding-greeting");
    expect(canvas.className).toContain("@container");
    expect(canvas.className).toContain("h-full");
    expect(greeting.textContent).toBe("Hello Leonard");
  });

  it("renders a placeholder where the onboarding canvas will go", () => {
    render(<SpielwieseOnboardingCanvas onboardingCanvas={onboardingCanvas} />);

    expect(
      screen.getByTestId("spielwiese-onboarding-placeholder"),
    ).toBeTruthy();
    expect(screen.getByText("Canvas placeholder.")).toBeTruthy();
  });
});
