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
  onActionClick?: () => void;
};

function TestPanel({
  initialPosition = { left: 100, top: 100 },
  initialSize = { width: 300, height: 240 },
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
});
