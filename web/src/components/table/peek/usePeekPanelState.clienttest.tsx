import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { PEEK_DEFAULT_WIDTH_FRACTION } from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";
const widthFraction = (style: React.CSSProperties) =>
  parseFloat(String(style.width)) / 100;

const renderPanel = (isOpen = true) =>
  renderHook(({ isOpen }) => usePeekPanelState({ isOpen }), {
    initialProps: { isOpen },
  });

function pressArrow(
  result: { current: ReturnType<typeof usePeekPanelState> },
  key: "ArrowLeft" | "ArrowRight",
) {
  act(() => {
    result.current.resizeHandleProps.onKeyDown({
      key,
      preventDefault: () => {},
    } as unknown as React.KeyboardEvent);
  });
}

describe("usePeekPanelState", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("exposes the widget width and a stable resize-handle contract", () => {
    const { result } = renderPanel();
    expect(result.current.isFullscreen).toBe(false);
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
    expect(result.current.resizeHandleProps.role).toBe("separator");
    expect(result.current.resizeHandleProps["aria-label"]).toBe(
      "Resize peek view",
    );
  });

  it("toggleFullscreen delegates to the store (100vw, then restore)", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.6");
    const { result } = renderPanel();
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    expect(result.current.panelStyle.width).toBe("100vw");
    act(() => result.current.toggleFullscreen());
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.6);
  });

  it("keyboard resize delegates to the nudge action", () => {
    const { result } = renderPanel();
    pressArrow(result, "ArrowLeft");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION + 0.05,
    );
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
  });

  it("resets fullscreen when the peek closes and stays reset on reopen", () => {
    const { result, rerender } = renderPanel(true);
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    rerender({ isOpen: false });
    expect(result.current.isFullscreen).toBe(false);

    rerender({ isOpen: true });
    expect(result.current.isFullscreen).toBe(false);
  });
});
