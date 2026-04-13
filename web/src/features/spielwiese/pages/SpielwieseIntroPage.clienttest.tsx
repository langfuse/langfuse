import { render, screen } from "@testing-library/react";
import SpielwieseIntroPage from "./SpielwieseIntroPage";

describe("SpielwieseIntroPage", () => {
  it("renders the redesign article intro page", () => {
    render(<SpielwieseIntroPage />);

    expect(screen.getByTestId("spielwiese-intro-page")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Langfuse redesign",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Overview",
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("spielwiese-intro-article")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-intro-section-divider-overview"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-intro-section-body-overview").className,
    ).toContain("sm:pl-[6.75rem]");
    expect(screen.getByTestId("spielwiese-intro-video-shell")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-intro-enter-link").getAttribute("href"),
    ).toBe("/dev/spielwiese/onboarding");
  });
});
