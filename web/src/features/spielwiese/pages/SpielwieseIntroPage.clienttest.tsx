import { render, screen } from "@testing-library/react";
import SpielwieseIntroPage from "./SpielwieseIntroPage";

describe("SpielwieseIntroPage", () => {
  it("renders the setup moment concept landing page", () => {
    render(<SpielwieseIntroPage />);

    expect(screen.getByTestId("spielwiese-intro-page")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Designing the setup moment for people who are not technical yet.",
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("spielwiese-intro-moment-setup")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-intro-video-shell")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-intro-enter-link").getAttribute("href"),
    ).toBe("/dev/spielwiese/onboarding");
  });
});
