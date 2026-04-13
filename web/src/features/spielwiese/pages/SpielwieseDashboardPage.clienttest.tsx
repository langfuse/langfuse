import { fireEvent, render, screen, within } from "@testing-library/react";
import "../components/spielwieseResizableTestMock";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

const originalHash = window.location.hash;
const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.location.hash = originalHash;
  window.matchMedia = originalMatchMedia;
});

function renderPage() {
  return render(<SpielwieseDashboardPage />);
}

function createDesktopMatchMedia() {
  return jest.fn().mockImplementation((query: string) => ({
    addEventListener: jest.fn(),
    matches: query === "(min-width: 768px)" || query === "(min-width: 1280px)",
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
  }));
}

function createDetachedUserVariable(value: string) {
  fireEvent.change(screen.getByLabelText("vision-agent User message"), {
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

function getCanvasHeader() {
  return screen.getByTestId("spielwiese-canvas-editor-mode-header");
}

function getHudPaddingControls(hud: HTMLElement) {
  return {
    padBottomSlider: within(hud).getByLabelText("Pad Bottom"),
    padLeftSlider: within(hud).getByLabelText("Pad Left"),
    padRightSlider: within(hud).getByLabelText("Pad Right"),
    padTopSlider: within(hud).getByLabelText("Pad Top"),
  };
}

// eslint-disable-next-line max-lines-per-function
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
    fireEvent.click(screen.getByRole("button", { name: "Recommend model" }));

    expect(screen.getAllByText("0 variables").length >= 1).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-model-recommendation-panel"),
    ).toBeNull();
  });

  it("uses the shared three-button header action cluster on the detached user card", () => {
    renderPage();

    const detachedUserSections = getDetachedUserSections();
    const collapseButton = within(detachedUserSections).getByRole("button", {
      name: "Minimize vision-agent User section",
    });
    const previewButton = within(detachedUserSections).getByRole("button", {
      name: "Preview vision-agent node",
    });
    const archiveButton = within(detachedUserSections).getByRole("button", {
      name: "Archive vision-agent node",
    });

    expect(collapseButton.className).toContain("size-7");
    expect(collapseButton.className).toContain("rounded-[10px]");
    expect(previewButton.className).toContain("size-7");
    expect(previewButton.className).toContain("rounded-[10px]");
    expect(archiveButton.className).toContain("size-7");
    expect(archiveButton.className).toContain("rounded-[10px]");
  });

  it("renders canvas-level card controls that collapse nodes, close both side panels, and keep archive inert", () => {
    window.matchMedia = createDesktopMatchMedia();
    renderPage();

    const shell = screen.getByTestId("spielwiese-shell");
    const canvasHeader = getCanvasHeader();
    const collapseAllButton = within(canvasHeader).getByRole("button", {
      name: "Collapse all canvas cards",
    });
    const closePanelsButton = within(canvasHeader).getByRole("button", {
      name: "Close side panels",
    });
    const archiveCanvasButton = within(canvasHeader).getByRole("button", {
      name: "Archive canvas nodes",
    });

    expect(shell.getAttribute("data-left-collapsed")).toBe("false");
    expect(shell.getAttribute("data-right-open")).toBe("true");
    expect(screen.getByLabelText("vision-agent User message")).toBeTruthy();

    fireEvent.click(collapseAllButton);

    expect(screen.queryByLabelText("vision-agent User message")).toBeNull();

    fireEvent.click(closePanelsButton);

    expect(shell.getAttribute("data-left-collapsed")).toBe("true");
    expect(shell.getAttribute("data-right-open")).toBe("false");

    fireEvent.click(archiveCanvasButton);

    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(1);
  });

  // eslint-disable-next-line max-lines-per-function
  it("renders a padding-only HUD for the shared section label chrome", () => {
    renderPage();

    const hud = screen.getByTestId("spielwiese-dashboard-debug-hud");
    const root = document.querySelector("[data-spielwiese]") as HTMLElement;
    const instructionsToggle = screen.getByRole("button", {
      name: "Toggle vision-agent Instructions section",
    });
    const previewLabelGroup = screen.getAllByTestId(
      "spielwiese-playground-flow-preview-label-group",
    )[0] as HTMLElement;
    const { padBottomSlider, padLeftSlider, padRightSlider, padTopSlider } =
      getHudPaddingControls(hud);

    expect(within(hud).queryByLabelText("Canvas Body X")).toBeNull();
    expect(within(hud).queryByLabelText("Header X")).toBeNull();
    expect(within(hud).queryByLabelText("Shell Surface color")).toBeNull();
    expect(
      within(hud).queryByRole("button", { name: "Hide flow header actions" }),
    ).toBeNull();
    expect(
      within(hud).queryByRole("button", { name: "Enable header blur" }),
    ).toBeNull();
    expect(
      within(hud).queryByRole("button", { name: "Enable header divider" }),
    ).toBeNull();
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-top",
      ),
    ).toBe("0px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-right",
      ),
    ).toBe("0px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-bottom",
      ),
    ).toBe("0px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-left",
      ),
    ).toBe("0px");
    expect(instructionsToggle.className).toContain(
      "pt-[var(--spielwiese-message-section-chip-padding-top)]",
    );
    expect(instructionsToggle.className).toContain(
      "pr-[var(--spielwiese-message-section-chip-padding-right)]",
    );
    expect(instructionsToggle.className).toContain(
      "pb-[var(--spielwiese-message-section-chip-padding-bottom)]",
    );
    expect(instructionsToggle.className).toContain(
      "pl-[var(--spielwiese-message-section-chip-padding-left)]",
    );
    expect(previewLabelGroup.className).toContain(
      "pt-[var(--spielwiese-message-section-chip-padding-top)]",
    );
    expect(previewLabelGroup.className).toContain(
      "pr-[var(--spielwiese-message-section-chip-padding-right)]",
    );
    expect(previewLabelGroup.className).toContain(
      "pb-[var(--spielwiese-message-section-chip-padding-bottom)]",
    );
    expect(previewLabelGroup.className).toContain(
      "pl-[var(--spielwiese-message-section-chip-padding-left)]",
    );

    fireEvent.change(padTopSlider, {
      target: { value: "2" },
    });
    fireEvent.change(padRightSlider, {
      target: { value: "4" },
    });
    fireEvent.change(padBottomSlider, {
      target: { value: "6" },
    });
    fireEvent.change(padLeftSlider, {
      target: { value: "12" },
    });

    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-top",
      ),
    ).toBe("2px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-right",
      ),
    ).toBe("4px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-bottom",
      ),
    ).toBe("6px");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-left",
      ),
    ).toBe("12px");
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
