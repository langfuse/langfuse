import { fireEvent, render, screen } from "@testing-library/react";

import { InAppAgentWindowHost } from "./InAppAgentWindowHost";

const mocks = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useCanUseInAppAgent: () => true,
    useInAppAiAgent: () => ({
      deleteConversation: vi.fn(),
      isExpanded: false,
      open: mocks.open,
      setIsExpanded: vi.fn(),
      setOpen: mocks.setOpen,
    }),
  }),
);

vi.mock(
  "@/src/ee/features/in-app-agent/components/ControlledInAppAgentWindow",
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

    // The `agent` overlay layer container normally declared in _document.
    const overlayRoot = document.createElement("div");
    overlayRoot.setAttribute("data-overlay-root", "");
    const agentLayer = document.createElement("div");
    agentLayer.setAttribute("data-layer", "agent");
    overlayRoot.appendChild(agentLayer);
    document.body.appendChild(overlayRoot);
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
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
});
