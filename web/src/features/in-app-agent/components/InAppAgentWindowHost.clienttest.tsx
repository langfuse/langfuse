import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { InAppAgentWindowHost } from "./InAppAgentWindowHost";
import type { InAppAgentDock } from "@/src/features/in-app-agent/presentation";

const mocks = vi.hoisted(() => ({
  open: false,
  dock: "sidebar" as InAppAgentDock,
  isExpanded: false,
  setOpen: vi.fn(),
  setDock: vi.fn(),
  setIsExpanded: vi.fn(),
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useIsInAppAgentLauncherVisible: () => true,
  useInAppAiAgent: () => ({
    deleteConversation: vi.fn(),
    dock: mocks.dock,
    isExpanded: mocks.isExpanded,
    open: mocks.open,
    setDock: mocks.setDock,
    setIsExpanded: mocks.setIsExpanded,
    setOpen: mocks.setOpen,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/components/ui/resizable-split-layout", () => ({
  ResizableSplitLayout: ({
    primaryContent,
    secondaryContent,
    open,
  }: {
    primaryContent: ReactNode;
    secondaryContent: ReactNode;
    open: boolean;
  }) => (
    <div>
      {primaryContent}
      {open ? secondaryContent : null}
    </div>
  ),
}));

vi.mock(
  "@/src/features/in-app-agent/components/ControlledInAppAgentWindow",
  () => ({
    ControlledInAppAgentWindow: () => (
      <div data-in-app-agent-window-drag-handle="true" data-testid="window">
        <textarea data-testid="composer" />
      </div>
    ),
  }),
);

function firePointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: MouseEventInit & { pointerId: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });

  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  fireEvent(element, event);
}

// The visual viewport is how a phone reports the on-screen keyboard: it shrinks
// while the layout viewport (`innerHeight`) does not. jsdom implements neither
// side, so the test owns both.
function stubVisualViewport(layoutHeight: number) {
  const viewport = Object.assign(new EventTarget(), {
    height: layoutHeight,
    offsetTop: 0,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: layoutHeight,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: viewport,
  });

  return function resizeTo(height: number, offsetTop = 0) {
    viewport.height = height;
    viewport.offsetTop = offsetTop;
    viewport.dispatchEvent(new Event("resize"));
  };
}

function stubHandheld() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("pointer: coarse"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderHost() {
  return render(
    <InAppAgentWindowHost>
      <div data-testid="page">page</div>
    </InAppAgentWindowHost>,
  );
}

describe("InAppAgentWindowHost", () => {
  beforeEach(() => {
    mocks.open = false;
    mocks.dock = "sidebar";
    mocks.isExpanded = false;
    mocks.setOpen.mockReset();
    mocks.setDock.mockReset();
    mocks.setIsExpanded.mockReset();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();

    // The overlay layer containers normally declared in _document.
    const overlayRoot = document.createElement("div");
    overlayRoot.setAttribute("data-overlay-root", "");
    for (const layer of ["panel", "agent"]) {
      const layerNode = document.createElement("div");
      layerNode.setAttribute("data-layer", layer);
      overlayRoot.appendChild(layerNode);
    }
    document.body.appendChild(overlayRoot);
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
    vi.unstubAllGlobals();
    // jsdom has no visual viewport, so leaving a stubbed one behind would hand
    // the next test a phone it never asked for.
    Reflect.deleteProperty(window, "visualViewport");
  });

  it("docks into a sidebar by default so page content stays visible", () => {
    mocks.open = true;
    renderHost();

    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.getByTestId("window")).toBeInTheDocument();
    expect(screen.getByTestId("in-app-agent-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();
  });

  it("detaches into the movable overlay without unmounting the page", () => {
    mocks.open = true;
    mocks.dock = "detached";
    renderHost();

    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.getByTestId("movable-resizable-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("in-app-agent-sidebar")).toBeNull();
  });

  it("keeps detached geometry while open and resets it on close/reopen", () => {
    mocks.dock = "detached";
    const { rerender } = render(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );

    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();

    mocks.open = true;
    rerender(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );

    // Default placement: bottom-right of the 1024x768 viewport.
    const panel = screen.getByTestId("movable-resizable-panel");
    expect(panel.style.left).toBe("568px");
    expect(panel.style.top).toBe("88px");

    const dragHandle = screen.getByTestId("window");
    firePointerEvent(dragHandle, "pointerdown", {
      pointerId: 1,
      clientX: 600,
      clientY: 100,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 500,
      clientY: 60,
    });
    firePointerEvent(panel, "pointerup", {
      pointerId: 1,
      clientX: 500,
      clientY: 60,
    });

    expect(panel.style.left).toBe("468px");
    expect(panel.style.top).toBe("48px");

    // Re-render while still open (e.g. after a route change): the dragged
    // geometry must survive.
    rerender(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );
    expect(screen.getByTestId("movable-resizable-panel").style.left).toBe(
      "468px",
    );

    mocks.open = false;
    rerender(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();

    mocks.open = true;
    rerender(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );
    expect(screen.getByTestId("movable-resizable-panel").style.left).toBe(
      "568px",
    );
    expect(screen.getByTestId("movable-resizable-panel").style.top).toBe(
      "88px",
    );
  });

  it("expands to fullscreen from the sidebar without the movable overlay", () => {
    mocks.open = true;
    mocks.isExpanded = true;
    renderHost();

    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.getByTestId("in-app-agent-fullscreen")).toBeInTheDocument();
    expect(screen.queryByTestId("in-app-agent-sidebar")).toBeNull();
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();
  });

  it("renders a full-screen drawer instead of the sidebar or movable panel on a handheld", () => {
    // A landscape phone: too wide for the `md` width clause, so only the
    // coarse-pointer clause can match. Pins that the shell asks the handheld
    // predicate, not the width-only one that sent a rotated phone back to the
    // floating window.
    stubHandheld();
    mocks.open = true;

    const { rerender } = renderHost();

    // No drag/resize on touch, and the drawer is the modal that scroll-locks
    // the page behind it.
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();
    expect(screen.queryByTestId("in-app-agent-sidebar")).toBeNull();
    expect(document.querySelector("#in-app-agent-drawer")).not.toBeNull();

    // Closing drives the drawer's own `open` prop rather than unmounting the
    // tree from under it, so Vaul can animate itself out.
    mocks.open = false;
    rerender(
      <InAppAgentWindowHost>
        <div data-testid="page">page</div>
      </InAppAgentWindowHost>,
    );
    expect(document.querySelector("#in-app-agent-drawer")).toHaveAttribute(
      "data-state",
      "closed",
    );
  });

  it("re-anchors the handheld drawer to the visible viewport on every keyboard cycle", () => {
    stubHandheld();
    // A phone with a 669px viewport and a 290px keyboard, as reported.
    const resizeViewportTo = stubVisualViewport(669);
    mocks.open = true;

    renderHost();
    const drawer = document.querySelector<HTMLElement>("#in-app-agent-drawer");
    const composer = screen.getByTestId("composer");

    // Repeated cycles are the point: the reported symptom needed "a couple of
    // times", which is a flag falling out of phase rather than one bad
    // measurement. iOS also reports the closing keyboard in more than one step
    // and blurs the field on the way out.
    for (const closingSteps of [[669], [520, 669], [669]]) {
      composer.focus();
      resizeViewportTo(669 - 290);
      // Above the keyboard, and the anchors — never an inline height — own it.
      expect(drawer?.style.bottom).toBe("290px");
      expect(drawer?.style.height).toBe("");

      composer.blur();
      for (const height of closingSteps) {
        resizeViewportTo(height);
      }
      expect(drawer?.style.bottom).toBe("0px");
      expect(drawer?.style.height).toBe("");
    }

    // Safari can also scroll the visual viewport instead of shrinking it; the
    // drawer follows the visible band rather than the layout viewport.
    composer.focus();
    resizeViewportTo(669 - 290, 290);
    expect(drawer?.style.bottom).toBe("0px");
    expect(drawer?.style.top).toBe("max(var(--banner-offset), 290px)");
  });
});
