import { render, screen } from "@testing-library/react";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

describe("SpielwieseDashboardPage", () => {
  it("renders the route with a scoped spielwiese root", () => {
    const { container } = render(<SpielwieseDashboardPage />);

    expect(
      screen.getByText(
        "A cleaner command deck for prompt iteration and review.",
      ),
    ).toBeTruthy();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });
});
