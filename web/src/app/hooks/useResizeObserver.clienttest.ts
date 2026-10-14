import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResizeObserver } from "./useResizeObserver";

describe("useResizeObserver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("measures initially, responds to resize, and disconnects on unmount", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notifyResize = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const ref = { current: document.createElement("div") };
    const onResize = vi.fn();
    const { unmount } = renderHook(() => useResizeObserver(ref, onResize));

    expect(observe).toHaveBeenCalledWith(ref.current);
    expect(onResize).toHaveBeenCalledTimes(1);
    act(() => notifyResize());
    expect(onResize).toHaveBeenCalledTimes(2);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("still measures when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const ref = { current: document.createElement("div") };
    const onResize = vi.fn();
    renderHook(() => useResizeObserver(ref, onResize));

    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("does not measure a missing element", () => {
    const onResize = vi.fn();
    renderHook(() => useResizeObserver({ current: null }, onResize));

    expect(onResize).not.toHaveBeenCalled();
  });
});
