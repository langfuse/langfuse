import { fireEvent, render, screen, within } from "@testing-library/react";
import "../components/spielwieseResizableTestMock";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

const originalHash = window.location.hash;

afterEach(() => {
  window.location.hash = originalHash;
});

function renderPage() {
  return render(<SpielwieseDashboardPage />);
}

function createDetachedUserVariable(value: string) {
  fireEvent.change(screen.getByLabelText("vision-agent User"), {
    target: { value },
  });
}

function updateFirstVariableHelper(value: string) {
  fireEvent.change(
    within(
      screen.getAllByTestId("spielwiese-variable-editor")[0]!,
    ).getByLabelText(/Variable helper/),
    {
      target: { value },
    },
  );
}

function getDetachedUserSections() {
  return screen.getByTestId("vision-agent-detached-user-sections");
}

describe("SpielwieseDashboardPage rendering", () => {
  it("renders the route with a scoped spielwiese root", () => {
    const { container } = renderPage();

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

    renderPage();

    expect(screen.getByTestId("spielwiese-prompt-canvas")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-editor-body")).toBeTruthy();
    expect(
      screen.getByText(/You are a food identification expert/i),
    ).toBeTruthy();
  });

  it("keeps the recommendation button inert in the picker", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "vision-agent Model",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recommend me a model" }),
    );

    expect(screen.getAllByText("0 variables").length >= 1).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-model-recommendation-panel"),
    ).toBeNull();
  });
});

describe("SpielwieseDashboardPage variables", () => {
  it("adds a new variable card when a detached user prompt creates a mustache variable", () => {
    renderPage();

    createDetachedUserVariable("Attach {{uploaded_file}}");

    expect(screen.getAllByText("1 variable").length >= 1).toBeTruthy();
    expect(
      screen.getAllByDisplayValue("uploaded_file").length >= 1,
    ).toBeTruthy();
  });

  it("keeps the detached user tag label raw and only shows the sample value in a hover tooltip", () => {
    renderPage();

    createDetachedUserVariable("Attach {{uploaded_file}}");
    updateFirstVariableHelper("menu-photo.png");

    const detachedUserSections = getDetachedUserSections();
    const mustacheTag = within(detachedUserSections).getByTestId(
      "spielwiese-mustache-tag-uploaded_file",
    );
    const mustacheTagSurface = within(detachedUserSections).getByTestId(
      "spielwiese-mustache-tag-uploaded_file-surface",
    );

    expect(mustacheTagSurface.textContent).toContain("{{uploaded_file}}");
    expect(mustacheTagSurface.textContent).not.toContain("menu-photo.png");
    expect(
      screen.queryByTestId("spielwiese-mustache-tag-uploaded_file-tooltip"),
    ).toBeNull();

    fireEvent.mouseEnter(mustacheTag);

    expect(
      screen.getByTestId("spielwiese-mustache-tag-uploaded_file-tooltip")
        .textContent,
    ).toContain("menu-photo.png");

    fireEvent.mouseLeave(mustacheTag);

    expect(
      screen.queryByTestId("spielwiese-mustache-tag-uploaded_file-tooltip"),
    ).toBeNull();
  });
});
