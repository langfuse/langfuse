import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { UnifiedObservationsDocsBanner } from "@/src/features/events/components/UnifiedObservationsDocsBanner";

describe("UnifiedObservationsDocsBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the concise inline guide link", () => {
    render(<UnifiedObservationsDocsBanner />);

    expect(screen.getByTestId("unified-observations-docs-banner")).toHaveClass(
      "bg-light-blue",
    );

    const guideLink = screen.getByRole("link", {
      name: /to filter/i,
    });
    expect(guideLink).toHaveAttribute(
      "href",
      "https://langfuse.com/faq/all/explore-observations-in-v4",
    );
  });

  it("stays hidden after dismissal", () => {
    const { unmount } = render(<UnifiedObservationsDocsBanner />);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss unified table guide" }),
    );

    expect(
      screen.queryByTestId("unified-observations-docs-banner"),
    ).not.toBeInTheDocument();

    unmount();
    render(<UnifiedObservationsDocsBanner />);

    expect(
      screen.queryByTestId("unified-observations-docs-banner"),
    ).not.toBeInTheDocument();
  });
});
