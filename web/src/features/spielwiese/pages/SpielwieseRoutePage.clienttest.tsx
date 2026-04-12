import { render, screen } from "@testing-library/react";
import SpielwieseRoutePage, { getSpielwieseRoute } from "./SpielwieseRoutePage";

jest.mock("./SpielwieseIntroPage", () => ({
  __esModule: true,
  default: function MockSpielwieseIntroPage() {
    return <div data-testid="spielwiese-route-intro" />;
  },
}));

jest.mock("./SpielwieseDashboardPage", () => ({
  __esModule: true,
  default: function MockSpielwieseDashboardPage() {
    return <div data-testid="spielwiese-route-dashboard" />;
  },
}));

jest.mock("./SpielwieseOnboardingPage", () => ({
  __esModule: true,
  default: function MockSpielwieseOnboardingPage({
    stepId,
  }: {
    stepId?: string;
  }) {
    return (
      <div
        data-step-id={stepId ?? ""}
        data-testid="spielwiese-route-onboarding"
      />
    );
  },
}));

describe("SpielwieseRoutePage", () => {
  it("routes the base path to the intro page", () => {
    render(<SpielwieseRoutePage />);

    expect(screen.getByTestId("spielwiese-route-intro")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-route-dashboard")).toBeNull();
    expect(screen.queryByTestId("spielwiese-route-onboarding")).toBeNull();
  });

  it("routes the dashboard path to the dashboard page", () => {
    render(<SpielwieseRoutePage slug={["dashboard"]} />);

    expect(screen.getByTestId("spielwiese-route-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-route-intro")).toBeNull();
    expect(screen.queryByTestId("spielwiese-route-onboarding")).toBeNull();
  });

  it("routes the onboarding path to the onboarding page", () => {
    render(<SpielwieseRoutePage slug={["onboarding"]} />);

    expect(screen.getByTestId("spielwiese-route-onboarding")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-route-dashboard")).toBeNull();
  });

  it("passes nested onboarding steps through to the onboarding page", () => {
    render(<SpielwieseRoutePage slug={["onboarding", "intent"]} />);

    expect(
      screen
        .getByTestId("spielwiese-route-onboarding")
        .getAttribute("data-step-id"),
    ).toBe("intent");
  });

  it("resolves unknown nested paths back to the intro page", () => {
    expect(getSpielwieseRoute()).toBe("intro");
    expect(getSpielwieseRoute(["drafts"])).toBe("intro");
    expect(getSpielwieseRoute(["onboarding"])).toBe("onboarding");
    expect(getSpielwieseRoute(["onboarding", "role"])).toBe("onboarding");
    expect(getSpielwieseRoute(["dashboard"])).toBe("dashboard");
  });
});
