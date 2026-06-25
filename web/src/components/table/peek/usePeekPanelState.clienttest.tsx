import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PEEK_DEFAULT_WIDTH_FRACTION,
  PEEK_MAX_WIDGET_WIDTH_FRACTION,
  PEEK_MIN_WIDTH_FRACTION,
  usePeekPanelState,
} from "@/src/components/table/peek/usePeekPanelState";

const STORAGE_KEY = "peekViewWidthFraction";

const widthFraction = (panelStyle: React.CSSProperties) =>
  parseFloat(String(panelStyle.width)) / 100;

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
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to the widget width and is not fullscreen", () => {
    const { result } = renderPanel();
    expect(result.current.isFullscreen).toBe(false);
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
  });

  it("reads a persisted width from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.7");
    const { result } = renderPanel();
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.7);
  });

  it("clamps an out-of-range persisted width into the widget bounds", () => {
    window.localStorage.setItem(STORAGE_KEY, "5");
    const { result } = renderPanel();
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_MAX_WIDGET_WIDTH_FRACTION,
    );
  });

  it("keyboard resize grows/shrinks within bounds and persists", () => {
    const { result } = renderPanel();

    // ArrowLeft grows the docked-right panel.
    pressArrow(result, "ArrowLeft");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION + 0.05,
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      String(PEEK_DEFAULT_WIDTH_FRACTION + 0.05),
    );

    // ArrowRight shrinks it back.
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
  });

  it("never shrinks below the minimum widget width", () => {
    window.localStorage.setItem(STORAGE_KEY, String(PEEK_MIN_WIDTH_FRACTION));
    const { result } = renderPanel();
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_MIN_WIDTH_FRACTION,
    );
  });

  it("toggles fullscreen to 100vw and restores the persisted widget width", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.65");
    const { result } = renderPanel();

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    expect(result.current.panelStyle.width).toBe("100vw");

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    // Width preference is untouched by the fullscreen round-trip.
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.65);
  });

  it("resets fullscreen when the peek closes (isOpen → false)", () => {
    const { result, rerender } = renderPanel(true);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    // Close the peek: fullscreen must not survive into the next open.
    rerender({ isOpen: false });
    expect(result.current.isFullscreen).toBe(false);

    // Reopen: still a widget, not stuck fullscreen.
    rerender({ isOpen: true });
    expect(result.current.isFullscreen).toBe(false);
  });

  it("keyboard resize while fullscreen does not clobber the saved width", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const { result } = renderPanel();

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    // ArrowRight exits fullscreen relative to the saved 0.5, not the 0.9 ceiling.
    pressArrow(result, "ArrowRight");
    expect(result.current.isFullscreen).toBe(false);
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.45);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.45");
  });
});
