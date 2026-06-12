import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  MovableResizablePanel,
  type MovableResizablePanelPosition,
  type MovableResizablePanelSize,
} from "./movable-resizable-panel";

type TestPanelProps = {
  initialPosition?: MovableResizablePanelPosition;
  initialSize?: MovableResizablePanelSize;
  maxSize?: MovableResizablePanelSize;
  minSize?: MovableResizablePanelSize;
  ignoreOutsideInteraction?: boolean;
  onActionClick?: () => void;
};

function TestPanel({
  initialPosition = { left: 100, top: 100 },
  initialSize = { width: 300, height: 240 },
  ignoreOutsideInteraction,
  maxSize,
  minSize = { width: 200, height: 160 },
  onActionClick,
}: TestPanelProps) {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);

  return (
    <MovableResizablePanel
      boundsPadding={10}
      dragHandleSelector="[data-drag-handle='true']"
      ignoreOutsideInteraction={ignoreOutsideInteraction}
      maxSize={maxSize}
      minSize={minSize}
      position={position}
      size={size}
      onPositionChange={setPosition}
      onSizeChange={setSize}
    >
      <div className="h-full w-full">
        <div data-drag-handle="true" data-testid="drag-handle">
          Drag
        </div>
        <div
          data-drag-handle="true"
          data-movable-resizable-panel-ignore-drag="true"
        >
          <button type="button" onClick={onActionClick}>
            Action
          </button>
        </div>
        <div data-testid="panel-state">
          {position.left},{position.top},{size.width},{size.height}
        </div>
      </div>
    </MovableResizablePanel>
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

describe("MovableResizablePanel", () => {
  beforeEach(() => {
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
  });

  it("moves by dragging the configured handle", () => {
    render(<TestPanel />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const handle = screen.getByTestId("drag-handle");

    firePointerEvent(handle, "pointerdown", {
      pointerId: 1,
      clientX: 140,
      clientY: 150,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 190,
      clientY: 180,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "150,130,300,240",
    );
  });

  it("resizes from the bottom-right handle", () => {
    render(<TestPanel />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-bottom-right",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 400,
      clientY: 340,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 460,
      clientY: 380,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,100,360,280",
    );
  });

  it("clamps resizing to the configured max size", () => {
    render(<TestPanel maxSize={{ width: 500, height: 420 }} />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-bottom-right",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 400,
      clientY: 340,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 900,
      clientY: 900,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,100,500,420",
    );
  });

  it("keeps the right edge anchored when left resizing hits the min width", () => {
    render(<TestPanel />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-left",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 220,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 300,
      clientY: 220,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "200,100,200,240",
    );
  });

  it("keeps the bottom edge anchored when top resizing hits the min height", () => {
    render(<TestPanel />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-top",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 220,
      clientY: 100,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 220,
      clientY: 300,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,180,300,160",
    );
  });

  it("clamps movement to viewport bounds", () => {
    render(<TestPanel />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const handle = screen.getByTestId("drag-handle");

    firePointerEvent(handle, "pointerdown", {
      pointerId: 1,
      clientX: 140,
      clientY: 150,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: -500,
      clientY: -500,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "10,10,300,240",
    );
  });

  it("does not start dragging from explicitly ignored elements inside a handle", () => {
    const onActionClick = vi.fn();

    render(<TestPanel onActionClick={onActionClick} />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const action = screen.getByRole("button", { name: "Action" });

    firePointerEvent(action, "pointerdown", {
      pointerId: 1,
      clientX: 140,
      clientY: 150,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 190,
      clientY: 180,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });
    fireEvent.click(action);

    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,100,300,240",
    );
  });

  it("can mark the root as ignored for outside interactions", () => {
    render(<TestPanel ignoreOutsideInteraction />);

    expect(screen.getByTestId("movable-resizable-panel")).toHaveAttribute(
      "data-ignore-outside-interaction",
    );
  });
});
