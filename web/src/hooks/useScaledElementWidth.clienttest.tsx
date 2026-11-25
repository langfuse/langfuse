import { act, renderHook } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { useScaledElementWidth } from "./useScaledElementWidth";

function sizedElement(width: number, scrollHeight = 100) {
  const element = document.createElement("div");
  let currentWidth = width;
  let currentScrollHeight = scrollHeight;
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => currentWidth,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => currentScrollHeight,
  });
  return {
    element,
    setWidth(next: number) {
      currentWidth = next;
    },
    setScrollHeight(next: number) {
      currentScrollHeight = next;
    },
  };
}

describe("useScaledElementWidth", () => {
  let notifyResize = () => {};
  let animationFrame: FrameRequestCallback | null = null;
  const disconnect = vi.fn();

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderSized(width: number) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      animationFrame = null;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    disconnect.mockClear();
    const container = sizedElement(width, 80);
    const content = sizedElement(width, 240);
    const hook = renderHook(() => useScaledElementWidth({ settleMs: 200 }));
    act(() => {
      hook.result.current.containerRef(container.element);
      hook.result.current.contentRef(content.element);
    });
    return { ...hook, container, content };
  }

  it("commits the first measured width and leaves the scale at rest", () => {
    const { result, container } = renderSized(400);

    expect(result.current.width).toBe(400);
    expect(result.current.contentStyle).toMatchObject({
      width: 400,
      transform: "scale(var(--lf-content-scale, 1))",
    });
    expect(result.current.containerStyle.height).toBe(
      "var(--lf-scaled-height, auto)",
    );
    expect(container.element.style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
  });

  it("scales on resize and commits the width only after it settles", () => {
    const { result, container, content } = renderSized(400);

    container.setWidth(500);
    act(() => notifyResize());
    expect(result.current.width).toBe(400);

    act(() => animationFrame?.(0));
    expect(result.current.width).toBe(400);
    expect(container.element.style.getPropertyValue("--lf-content-scale")).toBe(
      "1.25",
    );
    expect(container.element.style.getPropertyValue("--lf-scaled-height")).toBe(
      "300px",
    );
    expect(content.element.scrollHeight).toBe(240);

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.width).toBe(400);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.width).toBe(500);
    expect(result.current.contentStyle).toMatchObject({ width: 500 });
    expect(container.element.style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
  });

  it("ignores a resize that does not change the width", () => {
    const { result, container } = renderSized(400);

    container.setScrollHeight(900);
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.width).toBe(400);
    expect(container.element.style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = renderSized(400);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
