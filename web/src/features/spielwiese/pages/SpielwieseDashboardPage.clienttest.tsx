import { render, screen } from "@testing-library/react";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

describe("SpielwieseDashboardPage", () => {
  const originalHash = window.location.hash;

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it("renders the route with a scoped spielwiese root", () => {
    const { container } = render(<SpielwieseDashboardPage />);

    expect(
      screen.getByRole("heading", {
        name: "Assistant",
      }),
    ).toBeTruthy();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("renders the vision agent canvas when the hash selects it", () => {
    window.location.hash = "#vision-agent";

    render(<SpielwieseDashboardPage />);

    expect(
      screen.getByRole("heading", {
        name: "Vision Agent",
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("spielwiese-prompt-canvas")).toBeTruthy();
  });
});
