import { fireEvent, render, screen } from "@testing-library/react";

import { InAppAgentWindowHost } from "./InAppAgentWindowHost";

const mocks = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useCanUseInAppAgent: () => true,
  useInAppAiAgent: () => ({
    deleteConversation: vi.fn(),
    isExpanded: false,
    open: mocks.open,
    setIsExpanded: vi.fn(),
    setOpen: mocks.setOpen,
  }),
}));

vi.mock(
  "@/src/features/in-app-agent/components/ControlledInAppAgentWindow",
  () => ({
    ControlledInAppAgentWindow: () => (
      <div data-in-app-agent-window-drag-handle="true" data-testid="window" />
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

describe("InAppAgentWindowHost", () => {
  beforeEach(() => {
    mocks.open = false;
    mocks.setOpen.mockReset();

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
  });

  it("keeps geometry while open and resets it on close/reopen", () => {
    const { rerender } = render(<InAppAgentWindowHost />);

    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();

    mocks.open = true;
    rerender(<InAppAgentWindowHost />);

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
    rerender(<InAppAgentWindowHost />);
    expect(screen.getByTestId("movable-resizable-panel").style.left).toBe(
      "468px",
    );

    mocks.open = false;
    rerender(<InAppAgentWindowHost />);
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();

    mocks.open = true;
    rerender(<InAppAgentWindowHost />);
    expect(screen.getByTestId("movable-resizable-panel").style.left).toBe(
      "568px",
    );
    expect(screen.getByTestId("movable-resizable-panel").style.top).toBe(
      "88px",
    );
  });

  it("renders a full-screen drawer instead of the movable panel on a handheld", () => {
    // A landscape phone: too wide for the `md` width clause, so only the
    // coarse-pointer clause can match. Pins that the shell asks the handheld
    // predicate, not the width-only one that sent a rotated phone back to the
    // floating window.
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("pointer: coarse"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    mocks.open = true;

    const { rerender } = render(<InAppAgentWindowHost />);

    // No drag/resize on touch, and the drawer is the modal that scroll-locks
    // the page behind it.
    expect(screen.queryByTestId("movable-resizable-panel")).toBeNull();
    expect(document.querySelector("#in-app-agent-drawer")).not.toBeNull();

    // Closing drives the drawer's own `open` prop rather than unmounting the
    // tree from under it, so Vaul can animate itself out.
    mocks.open = false;
    rerender(<InAppAgentWindowHost />);
    expect(document.querySelector("#in-app-agent-drawer")).toHaveAttribute(
      "data-state",
      "closed",
    );
  });
});
