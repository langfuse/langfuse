import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";

import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "./InAppAgentWindowShell";

function TestShell() {
  const panelRef = useRef<HTMLDivElement>(null);
  const floatingPanelHandle = useInAppAgentWindowShellPanelControl();

  return (
    <>
      <button type="button" onClick={floatingPanelHandle.initializeGeometry}>
        Initialize panel
      </button>
      <InAppAgentWindowShell
        floatingPanelHandle={floatingPanelHandle}
        isExpanded={false}
        panelRef={panelRef}
      >
        {() => <div>Assistant</div>}
      </InAppAgentWindowShell>
    </>
  );
}

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

describe("InAppAgentWindowShell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1600,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 1200,
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it("can be resized taller than the default maximum height", () => {
    render(<TestShell />);

    fireEvent.click(screen.getByRole("button", { name: "Initialize panel" }));

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-top",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 800,
      clientY: 520,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 800,
      clientY: 100,
    });
    firePointerEvent(panel, "pointerup", {
      pointerId: 1,
      clientX: 800,
      clientY: 100,
    });

    expect(panel).toHaveStyle({
      top: "100px",
      height: "1092px",
    });
  });

  it("can be resized wider than the previous maximum width", () => {
    render(<TestShell />);

    fireEvent.click(screen.getByRole("button", { name: "Initialize panel" }));

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-left",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 1144,
      clientY: 800,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 8,
      clientY: 800,
    });
    firePointerEvent(panel, "pointerup", {
      pointerId: 1,
      clientX: 8,
      clientY: 800,
    });

    expect(panel).toHaveStyle({
      left: "8px",
      width: "1584px",
    });
  });
});
