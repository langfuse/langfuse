/* eslint-disable max-lines */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "../components/spielwieseResizableTestMock";
import { spielwieseAgentNodeColorPalette } from "../components/spielwieseAgentNodeColorPalette";
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

function expectHudColorValue(
  hud: HTMLElement,
  label: string,
  expectedValue: string,
) {
  const input = within(hud).getByLabelText(
    `${label} color`,
  ) as HTMLInputElement;

  expect(input.value).toBe(expectedValue);
}

function getHudLayoutControls(hud: HTMLElement) {
  return {
    actionToggle: within(hud).getByRole("button", {
      name: "Hide flow header actions",
    }),
    headerPadSlider: within(hud).getByLabelText("Header X"),
    surfacePadSlider: within(hud).getByLabelText("Canvas Body X"),
  };
}

function getHudChromeControls(hud: HTMLElement) {
  return {
    headerBlurToggle: within(hud).getByRole("button", {
      name: "Enable header blur",
    }),
    headerDividerToggle: within(hud).getByRole("button", {
      name: "Enable header divider",
    }),
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
  it("renders a layout HUD that updates the lower playground chrome live", () => {
    renderPage();

    const hud = screen.getByTestId("spielwiese-dashboard-debug-hud");
    const root = document.querySelector("[data-spielwiese]") as HTMLElement;
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const headerShell = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-shell",
    );
    const promptShell = within(visionNode).getByTestId(
      "spielwiese-system-message-prompt-shell",
    );
    const terminalSurface = screen.getByTestId(
      "spielwiese-playground-terminal-surface",
    );
    const playgroundHeader = screen.getByTestId("spielwiese-playground-header");
    const { actionToggle, headerPadSlider, surfacePadSlider } =
      getHudLayoutControls(hud);
    const shellSurfaceColor = within(hud).getByLabelText("Shell Surface color");
    const headerSurfaceColor = within(hud).getByLabelText(
      "Header Surface color",
    );
    const promptValueColor = within(hud).getByLabelText("Prompt Value color");
    const simulationPane = screen.getByTestId(
      "spielwiese-prompt-simulation-pane",
    );

    expect(terminalSurface.style.paddingLeft).toBe("44px");
    expect(terminalSurface.style.paddingRight).toBe("44px");
    expect(playgroundHeader.style.paddingLeft).toBe("8px");
    expect(playgroundHeader.style.paddingRight).toBe("8px");
    expect(playgroundHeader.style.marginLeft).toBe("-44px");
    expectHudColorValue(
      hud,
      "Shell Surface",
      spielwieseAgentNodeColorPalette.shellSurface,
    );
    expectHudColorValue(
      hud,
      "Header Surface",
      spielwieseAgentNodeColorPalette.headerSurface,
    );
    expectHudColorValue(
      hud,
      "Prompt Value",
      spielwieseAgentNodeColorPalette.promptValueSurface,
    );
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-shell-surface",
      ),
    ).toBe(spielwieseAgentNodeColorPalette.shellSurface);
    expect(nodeCard.getAttribute("style")).toContain(
      "--spielwiese-agent-node-shell-surface",
    );
    expect(headerShell.className).toContain(
      "bg-[var(--spielwiese-agent-node-header-surface)]",
    );
    expect(promptShell.className).toContain(
      "bg-[var(--spielwiese-agent-node-prompt-value-surface)]",
    );
    expect(
      within(simulationPane).queryAllByTestId(
        "spielwiese-playground-flow-node-actions",
      ),
    ).toHaveLength(1);

    fireEvent.change(surfacePadSlider, {
      target: { value: "14" },
    });
    fireEvent.change(headerPadSlider, {
      target: { value: "6" },
    });

    expect(terminalSurface.style.paddingLeft).toBe("14px");
    expect(terminalSurface.style.paddingRight).toBe("14px");
    expect(playgroundHeader.style.paddingLeft).toBe("6px");
    expect(playgroundHeader.style.paddingRight).toBe("6px");
    expect(playgroundHeader.style.marginLeft).toBe("-14px");

    fireEvent.change(shellSurfaceColor, {
      target: { value: "#E7F1EB" },
    });
    fireEvent.change(headerSurfaceColor, {
      target: { value: "rgba(255,240,235,0.88)" },
    });
    fireEvent.change(promptValueColor, {
      target: { value: "#FFF7F2" },
    });

    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-shell-surface",
      ),
    ).toBe("#E7F1EB");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-surface",
      ),
    ).toBe("rgba(255,240,235,0.88)");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-prompt-value-surface",
      ),
    ).toBe("#FFF7F2");

    fireEvent.click(actionToggle);

    expect(
      within(simulationPane).queryAllByTestId(
        "spielwiese-playground-flow-node-actions",
      ),
    ).toHaveLength(0);
  });

  it("lets the HUD toggle the agent-only header chrome choices", () => {
    renderPage();

    const hud = screen.getByTestId("spielwiese-dashboard-debug-hud");
    const root = document.querySelector("[data-spielwiese]") as HTMLElement;
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const headerRow = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-row",
    );
    const headerShell = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-shell",
    );
    const { headerBlurToggle, headerDividerToggle } = getHudChromeControls(hud);

    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-active-surface",
      ),
    ).toBe(spielwieseAgentNodeColorPalette.headerSurface);
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-backdrop-filter",
      ),
    ).toBe("none");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-divider",
      ),
    ).toBe("transparent");
    expect(headerRow.className).toContain(
      "border-[color:var(--spielwiese-agent-node-header-divider)]",
    );
    expect(headerShell.className).toContain(
      "bg-[var(--spielwiese-agent-node-header-active-surface)]",
    );

    fireEvent.click(headerBlurToggle);
    fireEvent.click(headerDividerToggle);

    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-active-surface",
      ),
    ).toBe(spielwieseAgentNodeColorPalette.headerSurfaceBackdrop);
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-backdrop-filter",
      ),
    ).toBe("blur(12px)");
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-agent-node-header-divider",
      ),
    ).toBe(spielwieseAgentNodeColorPalette.chromeBorder);
    expect(
      within(hud).getByRole("button", { name: "Disable header blur" }),
    ).toBeTruthy();
    expect(
      within(hud).getByRole("button", { name: "Disable header divider" }),
    ).toBeTruthy();
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
