import { render, screen } from "@testing-library/react";
import SpielwieseRoutePage, { getSpielwieseRoute } from "./SpielwieseRoutePage";

jest.mock("./SpielwieseDashboardPage", () => ({
  __esModule: true,
  default: function MockSpielwieseDashboardPage() {
    return <div data-testid="spielwiese-route-dashboard" />;
  },
}));

jest.mock("./SpielwieseOnboardingPage", () => ({
  __esModule: true,
  default: function MockSpielwieseOnboardingPage() {
    return <div data-testid="spielwiese-route-onboarding" />;
  },
}));

describe("SpielwieseRoutePage", () => {
  it("routes the base path to the dashboard page", () => {
    render(<SpielwieseRoutePage />);

    expect(screen.getByTestId("spielwiese-route-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-route-onboarding")).toBeNull();
  });

  it("routes the onboarding path to the onboarding page", () => {
    render(<SpielwieseRoutePage slug={["onboarding"]} />);

    expect(screen.getByTestId("spielwiese-route-onboarding")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-route-dashboard")).toBeNull();
  });

  it("resolves unknown nested paths back to the dashboard", () => {
    expect(getSpielwieseRoute()).toBe("dashboard");
    expect(getSpielwieseRoute(["drafts"])).toBe("dashboard");
    expect(getSpielwieseRoute(["onboarding"])).toBe("onboarding");
  });
});
