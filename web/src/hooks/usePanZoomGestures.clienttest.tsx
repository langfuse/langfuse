import { act, cleanup, renderHook } from "@testing-library/react";
import { type PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyPanZoomWheel,
  panZoomAnchor,
} from "@/src/utils/panZoomGestures";
import { usePanZoomGestures } from "./usePanZoomGestures";

const bounds = new DOMRect(20, 40, 400, 200);
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrame() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(16));
  });
}

function surface() {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => bounds;
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => false);
  return element;
}

function pointer(
  element: HTMLElement,
  pointerId: number,
  x: number,
  y: number,
  options: { isPrimary?: boolean; pointerType?: string; buttons?: number } = {},
): ReactPointerEvent<HTMLElement> {
  return {
    currentTarget: element,
    pointerId,
    clientX: x,
    clientY: y,
    pointerType: options.pointerType ?? "touch",
    isPrimary: options.isPrimary ?? false,
    button: 0,
    buttons: options.buttons ?? 1,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("pan and zoom device input", () => {
  it("keeps a fast unmodified scroll as pan and normalizes line/page units", () => {
    expect(
      classifyPanZoomWheel(new WheelEvent("wheel", { deltaY: 400 }), bounds),
    ).toEqual({ kind: "pan", dxPx: -0, dyPx: -400 });
    expect(
      classifyPanZoomWheel(
        new WheelEvent("wheel", { deltaX: 2, deltaY: 3, deltaMode: 1 }),
        bounds,
      ),
    ).toEqual({ kind: "pan", dxPx: -32, dyPx: -48 });
    expect(
      classifyPanZoomWheel(
        new WheelEvent("wheel", { deltaY: 1, deltaMode: 2, shiftKey: true }),
        bounds,
      ),
    ).toEqual({ kind: "pan", dxPx: -200, dyPx: 0 });
  });

  it("anchors to the measured surface and clamps an off-surface pointer", () => {
    expect(panZoomAnchor({ x: 320, y: 90 }, bounds)).toEqual({
      x: 0.75,
      y: 0.25,
    });
    expect(panZoomAnchor({ x: -100, y: 300 }, bounds)).toEqual({ x: 0, y: 1 });
    expect(panZoomAnchor({ x: 20, y: 40 }, new DOMRect(20, 40, 0, 0))).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("accumulates pinch zoom in scale levels once per frame at the cursor", () => {
    const element = surface();
    const onZoom = vi.fn();
    renderHook(() =>
      usePanZoomGestures({
        target: { current: element },
        onPan: vi.fn(),
        onZoom,
      }),
    );
    const wheel = () =>
      new WheelEvent("wheel", {
        deltaY: -4,
        ctrlKey: true,
        clientX: 320,
        clientY: 90,
        cancelable: true,
      });
    const first = wheel();
    element.dispatchEvent(first);
    element.dispatchEvent(wheel());
    expect(first.defaultPrevented).toBe(true);
    expect(onZoom).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(onZoom).toHaveBeenCalledExactlyOnceWith(0.2, { x: 0.75, y: 0.25 });
  });

  it("hands page scrolling back at the camera boundary", () => {
    const element = surface();
    const onPan = vi.fn();
    renderHook(() =>
      usePanZoomGestures({
        target: { current: element },
        onPan,
        onZoom: vi.fn(),
        canPan: () => false,
      }),
    );
    const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    element.dispatchEvent(event);
    flushFrame();
    expect(event.defaultPrevented).toBe(false);
    expect(onPan).not.toHaveBeenCalled();
  });

  it("delays pointer capture until dragging and preserves ordinary clicks", () => {
    const element = surface();
    const onPan = vi.fn();
    const click = vi.fn();
    const parent = document.createElement("div");
    parent.append(element);
    parent.addEventListener("click", click);
    const target = { current: element };
    const { result } = renderHook(() =>
      usePanZoomGestures({ target, onPan, onZoom: vi.fn() }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 1, 100, 100, {
          isPrimary: true,
          pointerType: "mouse",
        }),
      );
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 1, 102, 100, { pointerType: "mouse" }),
      );
    });
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    act(() => {
      result.current.pointerHandlers.onPointerUp(pointer(element, 1, 102, 100));
    });
    element.dispatchEvent(
      new MouseEvent("click", { cancelable: true, bubbles: true }),
    );
    expect(click).toHaveBeenCalledOnce();

    act(() => {
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 2, 100, 100, {
          isPrimary: true,
          pointerType: "mouse",
        }),
      );
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 2, 110, 120),
      );
    });
    expect(element.setPointerCapture).toHaveBeenCalledExactlyOnceWith(2);
    flushFrame();
    expect(onPan).toHaveBeenCalledExactlyOnceWith(10, 20);
    act(() => {
      result.current.pointerHandlers.onPointerUp(pointer(element, 2, 110, 120));
    });
    const draggedClick = new MouseEvent("click", {
      cancelable: true,
      bubbles: true,
    });
    element.dispatchEvent(draggedClick);
    expect(draggedClick.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it("combines a touch pinch with midpoint pan and reanchors the surviving finger", () => {
    const element = surface();
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const target = { current: element };
    const { result } = renderHook(() =>
      usePanZoomGestures({ target, onPan, onZoom }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 1, 120, 140, { isPrimary: true }),
      );
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 2, 220, 140),
      );
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 2, 320, 140),
      );
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 1, 140, 140),
      );
    });
    flushFrame();
    // 100px → 180px; anchor is the original midpoint, then 60px translation.
    expect(onZoom).toHaveBeenCalledExactlyOnceWith(Math.log2(1.8), {
      x: 0.375,
      y: 0.5,
    });
    expect(onPan).toHaveBeenCalledExactlyOnceWith(60, 0);
    act(() => {
      result.current.pointerHandlers.onPointerUp(pointer(element, 2, 320, 140));
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 1, 150, 140),
      );
    });
    flushFrame();
    expect(onPan).toHaveBeenLastCalledWith(10, 0);
    expect(onZoom).toHaveBeenCalledOnce();
  });

  it("continues pinching when three contacts become a different pair", () => {
    const element = surface();
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const target = { current: element };
    const { result } = renderHook(() =>
      usePanZoomGestures({ target, onPan, onZoom }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 1, 120, 140, { isPrimary: true }),
      );
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 2, 220, 140),
      );
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 3, 320, 140),
      );
      result.current.pointerHandlers.onPointerUp(pointer(element, 1, 120, 140));
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 3, 420, 140),
      );
    });
    flushFrame();
    expect(onZoom).toHaveBeenCalledExactlyOnceWith(1, { x: 0.625, y: 0.5 });
    expect(onPan).toHaveBeenCalledExactlyOnceWith(50, 0);
    expect(result.current.isDragging).toBe(true);
  });

  it("forgets a mouse press released outside the surface before capture", () => {
    const element = surface();
    const onPan = vi.fn();
    const target = { current: element };
    const { result } = renderHook(() =>
      usePanZoomGestures({ target, onPan, onZoom: vi.fn() }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown(
        pointer(element, 1, 21, 100, {
          isPrimary: true,
          pointerType: "mouse",
        }),
      );
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 1, 20, 100, { pointerType: "mouse" }),
      );
      // The release happens outside, so the next event is an unpressed hover.
      result.current.pointerHandlers.onPointerMove(
        pointer(element, 1, 100, 100, { pointerType: "mouse", buttons: 0 }),
      );
    });
    flushFrame();
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    expect(onPan).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("uses the latest camera callbacks for a pending frame and cancels on unmount", () => {
    const element = surface();
    const target = { current: element };
    const oldPan = vi.fn();
    const nextPan = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onPan }) => usePanZoomGestures({ target, onPan, onZoom: vi.fn() }),
      { initialProps: { onPan: oldPan } },
    );
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
    rerender({ onPan: nextPan });
    flushFrame();
    expect(oldPan).not.toHaveBeenCalled();
    expect(nextPan).toHaveBeenCalledExactlyOnceWith(0, -20);
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
    unmount();
    expect(frames.size).toBe(0);
    flushFrame();
    expect(nextPan).toHaveBeenCalledOnce();
  });
});
