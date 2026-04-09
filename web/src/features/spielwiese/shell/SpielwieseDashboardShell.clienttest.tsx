import { render, screen } from "@testing-library/react";
import { SpielwieseDashboardShell } from "./SpielwieseDashboardShell";

describe("SpielwieseDashboardShell", () => {
  it("renders a local shell without product preview chrome", () => {
    const { container } = render(
      <SpielwieseDashboardShell>
        <div>Shell content</div>
      </SpielwieseDashboardShell>,
    );

    expect(screen.getByText("Local dashboard shell")).toBeTruthy();
    expect(screen.getByText("Shell content")).toBeTruthy();
    expect(screen.queryByText("langofuso")).toBeNull();
    expect(screen.queryByText("langfuse-redesign")).toBeNull();
    expect(
      container.querySelector("[data-testid='spielwiese-shell']"),
    ).toBeTruthy();
  });
});
