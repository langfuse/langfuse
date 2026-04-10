import { render, screen } from "@testing-library/react";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

describe("SpielwieseDashboardPage", () => {
  const originalHash = window.location.hash;

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it("renders the route with a scoped spielwiese root", () => {
    const { container } = render(<SpielwieseDashboardPage />);

    const editorCanvas = screen.getByTestId("spielwiese-editor-canvas");

    expect(editorCanvas).toBeTruthy();
    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(3);
    expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("[image]")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell-header")).toBeTruthy();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("renders the vision agent canvas when the hash selects it", () => {
    window.location.hash = "#vision-agent";

    render(<SpielwieseDashboardPage />);

    expect(screen.getByTestId("spielwiese-prompt-canvas")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-editor-body")).toBeTruthy();
    expect(
      screen.getByText(/You are a food identification expert/i),
    ).toBeTruthy();
  });
});
