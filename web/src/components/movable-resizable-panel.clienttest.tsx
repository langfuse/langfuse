import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  MovableResizablePanel,
  useMovableResizablePanelControl,
  type MovableResizablePanelGeometry,
  type MovableResizablePanelPosition,
  type MovableResizablePanelSize,
} from "./movable-resizable-panel";

type TestPanelProps = {
  boundsPadding?: number;
  initialPosition?: MovableResizablePanelPosition;
  initialSize?: MovableResizablePanelSize;
  maxSize?: MovableResizablePanelSize;
  minSize?: MovableResizablePanelSize;
  ignoreOutsideInteraction?: boolean;
  onActionClick?: () => void;
  onDragHandleDoubleClick?: () => void;
  onGeometryChange?: (geometry: MovableResizablePanelGeometry) => void;
};

function TestPanel({
  boundsPadding = 10,
  initialPosition = { left: 100, top: 100 },
  initialSize = { width: 300, height: 240 },
  ignoreOutsideInteraction,
  maxSize,
  minSize = { width: 200, height: 160 },
  onActionClick,
  onDragHandleDoubleClick,
  onGeometryChange,
}: TestPanelProps) {
  const handle = useMovableResizablePanelControl({
    boundsPadding,
    getInitialGeometry: () => ({
      position: initialPosition,
      size: initialSize,
    }),
    maxSize,
    minSize,
  });
  const geometry = handle.getGeometry();

  return (
    <MovableResizablePanel
      dragHandleSelector="[data-drag-handle='true']"
      handle={{
        ...handle,
        setGeometry: (nextGeometry) => {
          handle.setGeometry(nextGeometry);
          onGeometryChange?.(nextGeometry);
        },
      }}
      ignoreOutsideInteraction={ignoreOutsideInteraction}
      onDragHandleDoubleClick={onDragHandleDoubleClick}
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
          {`${geometry.position.left},${geometry.position.top},${geometry.size.width},${geometry.size.height}`}
        </div>
      </div>
    </MovableResizablePanel>
  );
}

function firePointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: MouseEventInit & { pointerId: number; timeStamp?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });

  Object.defineProperty(event, "pointerId", { value: init.pointerId });

  if (init.timeStamp !== undefined) {
    Object.defineProperty(event, "timeStamp", { value: init.timeStamp });
  }

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

  // Starting a drag has to `preventDefault()` the pointerdown, which suppresses
  // the browser's own `dblclick`, so the panel detects the pair itself.
  it("reports a double-click on the drag handle without moving the panel", () => {
    const onDragHandleDoubleClick = vi.fn();
    render(<TestPanel onDragHandleDoubleClick={onDragHandleDoubleClick} />);

    const panel = screen.getByTestId("movable-resizable-panel");
    const handle = screen.getByTestId("drag-handle");

    firePointerEvent(handle, "pointerdown", {
      pointerId: 1,
      clientX: 140,
      clientY: 150,
      timeStamp: 1_000,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });
    firePointerEvent(handle, "pointerdown", {
      pointerId: 2,
      clientX: 141,
      clientY: 151,
      timeStamp: 1_120,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 2,
      clientX: 220,
      clientY: 220,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 2 });

    expect(onDragHandleDoubleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,100,300,240",
    );

    // Too slow to be a pair, so it drags instead.
    firePointerEvent(handle, "pointerdown", {
      pointerId: 3,
      clientX: 141,
      clientY: 151,
      timeStamp: 3_000,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 3,
      clientX: 161,
      clientY: 171,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 3 });

    expect(onDragHandleDoubleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "120,120,300,240",
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

  it("keeps the right edge anchored when left resizing hits the viewport", () => {
    render(
      <TestPanel
        boundsPadding={8}
        initialPosition={{ left: 20, top: 100 }}
        initialSize={{ width: 200, height: 240 }}
      />,
    );

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-left",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 20,
      clientY: 220,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: -80,
      clientY: 220,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "8,100,212,240",
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

  it("keeps the bottom edge anchored when top resizing hits the viewport", () => {
    render(
      <TestPanel
        boundsPadding={8}
        initialPosition={{ left: 100, top: 20 }}
        initialSize={{ width: 300, height: 240 }}
      />,
    );

    const panel = screen.getByTestId("movable-resizable-panel");
    const resizeHandle = screen.getByTestId(
      "movable-resizable-panel-resize-top",
    );

    firePointerEvent(resizeHandle, "pointerdown", {
      pointerId: 1,
      clientX: 220,
      clientY: 20,
    });
    firePointerEvent(panel, "pointermove", {
      pointerId: 1,
      clientX: 220,
      clientY: -80,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "100,8,300,252",
    );
  });

  it("ignores window resize while an interaction is in flight", () => {
    const onGeometryChange = vi.fn();

    render(
      <TestPanel
        initialPosition={{ left: 700, top: 100 }}
        initialSize={{ width: 300, height: 240 }}
        onGeometryChange={onGeometryChange}
      />,
    );

    const handle = screen.getByTestId("drag-handle");

    firePointerEvent(handle, "pointerdown", {
      pointerId: 1,
      clientX: 740,
      clientY: 150,
    });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    fireEvent.resize(window);

    expect(onGeometryChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "700,100,300,240",
    );
  });

  it("does not leave gaps between corner and edge resize handles", () => {
    render(<TestPanel />);

    expect(
      screen.getByTestId("movable-resizable-panel-resize-top"),
    ).toHaveStyle({ left: "5px", right: "5px" });
    expect(
      screen.getByTestId("movable-resizable-panel-resize-left"),
    ).toHaveStyle({ top: "5px", bottom: "5px" });
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

  it("keeps clamping clear of the safe-area insets", () => {
    // Silent-failure guard: a wrong var name would just read 0 and place the
    // panel under the home indicator with nothing to notice.
    document.documentElement.style.setProperty(
      "--safe-area-inset-right",
      "20px",
    );
    document.documentElement.style.setProperty(
      "--safe-area-inset-bottom",
      "34px",
    );

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
      clientX: 5000,
      clientY: 5000,
    });
    firePointerEvent(panel, "pointerup", { pointerId: 1 });

    // 1024 - 10 padding - 20 inset - 300 wide, 768 - 10 - 34 - 240 tall.
    expect(screen.getByTestId("panel-state")).toHaveTextContent(
      "694,484,300,240",
    );

    document.documentElement.style.removeProperty("--safe-area-inset-right");
    document.documentElement.style.removeProperty("--safe-area-inset-bottom");
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
