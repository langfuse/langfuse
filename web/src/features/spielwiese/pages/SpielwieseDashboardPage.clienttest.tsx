import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "../components/spielwieseResizableTestMock";
import {
  resetOnboardingDashboardHandoffForTests,
  setOnboardingDashboardHandoff,
} from "../onboarding/spielwieseOnboardingDashboardHandoff";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";

const originalHash = window.location.hash;
const originalMatchMedia = window.matchMedia;

afterEach(() => {
  jest.useRealTimers();
  window.location.hash = originalHash;
  window.matchMedia = originalMatchMedia;
  resetOnboardingDashboardHandoffForTests();
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

function getEmptyStateNewNodeTrigger() {
  return within(
    screen.getByTestId("spielwiese-agent-node-empty-state"),
  ).getByTestId("spielwiese-agent-node-insert-trigger");
}

function expectDefaultCanvasLayerVars(root: HTMLElement) {
  expect(root.style.colorScheme).toBe("light");
  expect(root.style.getPropertyValue("--background")).toBe("0 0% 100%");
  expect(root.style.getPropertyValue("--foreground")).toBe("222.2 84% 4.9%");
  expect(
    root.style.getPropertyValue(
      "--spielwiese-dashboard-canvas-pane-background",
    ),
  ).toBe("#FCFCFD");
  expect(
    root.style.getPropertyValue(
      "--spielwiese-dashboard-canvas-pane-shell-background",
    ),
  ).toBe("#FCFCFD");
  expect(
    root.style.getPropertyValue(
      "--spielwiese-dashboard-canvas-pane-surface-background",
    ),
  ).toBe("#FFFFFF");
  expect(
    root.style.getPropertyValue("--spielwiese-dashboard-canvas-pane-outline"),
  ).toBe("transparent");
  expect(
    root.style.getPropertyValue(
      "--spielwiese-dashboard-canvas-pane-shell-outline",
    ),
  ).toBe("transparent");
  expect(
    root.style.getPropertyValue(
      "--spielwiese-dashboard-canvas-pane-surface-outline",
    ),
  ).toBe("transparent");
}

// eslint-disable-next-line max-lines-per-function
describe("SpielwieseDashboardPage rendering", () => {
  it("renders the empty assistant route with a scoped spielwiese root and keeps the new node entry visible", () => {
    const { container } = renderPage();

    const editorCanvas = screen.getByTestId("spielwiese-editor-canvas");
    const root = container.querySelector("[data-spielwiese]");

    expect(editorCanvas).toBeTruthy();
    expect(screen.queryAllByTestId("spielwiese-agent-node")).toHaveLength(0);
    expect(
      screen.getByTestId("spielwiese-agent-node-insert-footer"),
    ).toBeTruthy();
    expect(getEmptyStateNewNodeTrigger()).toBeTruthy();
    expect(
      screen.queryAllByTestId("spielwiese-playground-flow-node"),
    ).toHaveLength(0);
    expect(screen.queryByDisplayValue("Vision Agent")).toBeNull();
    expect(screen.queryByDisplayValue("Nutrition Agent")).toBeNull();
    expect(screen.queryByDisplayValue("Coach Agent")).toBeNull();
    expect(screen.queryAllByDisplayValue("[image]")).toHaveLength(0);
    expect(screen.getByTestId("spielwiese-shell")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell-header")).toBeTruthy();
    expect(root).toBeTruthy();
    expect(getEmptyStateNewNodeTrigger()).toBeTruthy();
    expect(root?.className).toContain("h-screen-with-banner");
    expect(root?.className).toContain("overflow-hidden");
    expect(root?.className).toContain("bg-background");
    expect(root?.className).toContain("text-foreground");
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

  it("adds the first node from the empty assistant canvas and mirrors it into the playground flow", () => {
    window.matchMedia = createDesktopMatchMedia();
    renderPage();

    fireEvent.click(getEmptyStateNewNodeTrigger());
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));

    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(1);
    expect(
      screen.getAllByTestId("spielwiese-playground-flow-node"),
    ).toHaveLength(1);
  });

  it("hydrates the assistant dashboard from onboarding handoff values", () => {
    setOnboardingDashboardHandoff({
      modelValue: "Claude Opus 4.6",
      systemPromptValue: "Act as if you were a senior business strategist",
    });

    renderPage();

    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "vision-agent Model" }).textContent,
    ).toContain("Claude Opus 4.6");
    expect(
      (
        screen.getByLabelText(
          "vision-agent Instructions",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Act as if you were a senior business strategist");
  });

  // eslint-disable-next-line max-lines-per-function
  it("renders the seeded role-flow dashboard without card handoff, top-card reveal, typing, or play glow", () => {
    jest.useFakeTimers();

    setOnboardingDashboardHandoff({
      modelValue: "Claude Opus 4.6",
      systemPromptValue: "Act as if you were a senior business strategist",
      transitionKind: "role-flow",
    });

    renderPage();

    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(1);
    const detachedUserDeck = screen.getByTestId(
      "vision-agent-detached-user-sections",
    ) as HTMLElement;
    const userInput = screen.getByLabelText(
      "vision-agent User message",
    ) as HTMLTextAreaElement;
    const playButton = screen.getByTestId(
      "spielwiese-playground-play-button",
    ) as HTMLButtonElement;
    const internalArrow = screen.getByTestId(
      "spielwiese-agent-node-internal-connector-arrow",
    );
    const targetNodeDeck = screen.getAllByTestId(
      "spielwiese-agent-node-card-deck",
    )[0] as HTMLElement;

    expect(internalArrow).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-onboarding-dashboard-node-handoff"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "vision-agent Model" }).textContent,
    ).toContain("Claude Opus 4.6");
    expect(
      (
        screen.getByLabelText(
          "vision-agent Instructions",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Act as if you were a senior business strategist");
    expect(detachedUserDeck.style.opacity).toBe("");
    expect(detachedUserDeck.style.transform).toBe("");
    expect(detachedUserDeck.style.filter).toBe("");
    expect(detachedUserDeck.style.transition).toBe("");
    expect(targetNodeDeck.style.opacity).toBe("");
    expect(userInput.value).toBe(
      "Here you can type in user messages... try it out (delete me and type write something)",
    );
    expect(playButton.dataset.onboardingHighlight).toBeUndefined();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      screen.queryByTestId("spielwiese-onboarding-dashboard-node-handoff"),
    ).toBeNull();
    expect(detachedUserDeck.style.opacity).toBe("");
    expect(detachedUserDeck.style.transform).toBe("");
    expect(detachedUserDeck.style.filter).toBe("");
    expect(detachedUserDeck.style.transition).toBe("");
    expect(userInput.value).toBe(
      "Here you can type in user messages... try it out (delete me and type write something)",
    );

    act(() => {
      fireEvent.input(userInput, {
        target: {
          value: "Plan a vegetarian lunch with 30g protein",
        },
      });
    });
    act(() => {
      jest.advanceTimersByTime(360);
    });

    expect(playButton.dataset.onboardingHighlight).toBeUndefined();
    expect(playButton.style.boxShadow).toBe("");
  });

  it("keeps user-only steps blank in the playground but includes the agent tag in the header", () => {
    window.matchMedia = createDesktopMatchMedia();
    renderPage();

    fireEvent.click(getEmptyStateNewNodeTrigger());
    fireEvent.click(screen.getByRole("button", { name: "User" }));

    const userInput = screen.getByLabelText("user-node User message");

    fireEvent.change(userInput, {
      target: {
        value: "Track this lunch and summarize the macros.",
      },
    });

    const flowNode = screen.getByTestId("spielwiese-playground-flow-node");
    const headerTagStrip = flowNode.querySelector(
      '[data-testid="spielwiese-playground-flow-node-tag-strip"]',
    ) as HTMLElement | null;

    expect(
      screen.queryByTestId("spielwiese-playground-flow-preview-value"),
    ).toBeNull();
    expect(headerTagStrip?.textContent).toContain("User");
    expect(headerTagStrip?.textContent).toContain("Agent");
  });

  it("wires the shared layer defaults into the root vars without rendering a debug HUD", () => {
    renderPage();

    const root = document.querySelector("[data-spielwiese]") as HTMLElement;

    expect(screen.queryByTestId("spielwiese-dashboard-debug-hud")).toBeNull();
    expectDefaultCanvasLayerVars(root);
    expect(
      root.style.getPropertyValue(
        "--spielwiese-dashboard-message-section-chip-padding-top",
      ),
    ).toBe("2px");
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
  });
});
