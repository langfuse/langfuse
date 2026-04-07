import { render, screen } from "@testing-library/react";
import { GreenfieldOnboardingView } from "./GreenfieldOnboardingView";

describe("GreenfieldOnboardingView", () => {
  it("renders the refined track sidebar with anchor links", () => {
    const { container } = render(
      <GreenfieldOnboardingView
        projectId="project-1"
        organizationId="organization-1"
      />,
    );

    expect(screen.getByText("Greenfield onboarding")).toBeTruthy();
    expect(screen.getByText("Track map")).toBeTruthy();
    expect(
      screen.getByText("Stand up a reliable prompt workflow"),
    ).toBeTruthy();

    expect(container.querySelector('a[href="#pillar-iterate"]')).toBeTruthy();
    expect(container.querySelector('a[href="#pillar-evaluate"]')).toBeTruthy();
  });
});
