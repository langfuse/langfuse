import { fireEvent, render, screen } from "@testing-library/react";
import "../components/spielwieseResizableTestMock";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

describe("SpielwieseDashboardPage", () => {
  const originalHash = window.location.hash;

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it("renders the route with a scoped spielwiese root", () => {
    const { container } = render(<SpielwieseDashboardPage />);

    const editorCanvas = screen.getByTestId("spielwiese-editor-canvas");
    const root = container.querySelector("[data-spielwiese]");

    expect(editorCanvas).toBeTruthy();
    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(1);
    expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
    expect(screen.queryByDisplayValue("Nutrition Agent")).toBeNull();
    expect(screen.queryByDisplayValue("Coach Agent")).toBeNull();
    expect(screen.getAllByDisplayValue("[image]").length >= 1).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell-header")).toBeTruthy();
    expect(root).toBeTruthy();
    expect(root?.className).toContain("h-screen-with-banner");
    expect(root?.className).toContain("overflow-hidden");
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

  it("keeps the recommendation button inert in the picker", () => {
    render(<SpielwieseDashboardPage />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "vision-agent Model",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recommend me a model" }),
    );

    expect(screen.getAllByText("3 variables").length >= 1).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-model-recommendation-panel"),
    ).toBeNull();
  });
});
