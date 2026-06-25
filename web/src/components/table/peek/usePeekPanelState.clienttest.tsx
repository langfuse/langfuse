import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { PEEK_DEFAULT_WIDTH_FRACTION } from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";
const widthFraction = (style: React.CSSProperties) =>
  parseFloat(String(style.width)) / 100;

function setup(isExpanded = false) {
  const onExpandedChange = vi.fn();
  const { result, rerender } = renderHook(
    ({ isExpanded }) =>
      usePeekPanelState({ isOpen: true, isExpanded, onExpandedChange }),
    { initialProps: { isExpanded } },
  );
  return { result, rerender, onExpandedChange };
}

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

  it("renders the widget width and a stable resize-handle contract", () => {
    const { result } = setup();
    expect(result.current.isExpanded).toBe(false);
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
    expect(result.current.resizeHandleProps.role).toBe("separator");
    expect(result.current.resizeHandleProps["aria-label"]).toBe(
      "Resize peek view",
    );
  });

  it("renders the expanded (viewport − sidebar) width when expanded", () => {
    const { result } = setup(true);
    expect(result.current.isExpanded).toBe(true);
    // No sidebar element in jsdom → offset 0 → full viewport calc.
    expect(String(result.current.panelStyle.width)).toContain("calc(100vw");
  });

  it("toggleExpanded writes the expanded flag (URL) via the callback", () => {
    const { result, onExpandedChange } = setup(false);
    act(() => result.current.toggleExpanded());
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("keyboard resize collapses expanded and nudges the widget width", () => {
    const { result, onExpandedChange } = setup(false);
    pressArrow(result, "ArrowLeft");
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION + 0.05,
    );
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(
      PEEK_DEFAULT_WIDTH_FRACTION,
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      String(PEEK_DEFAULT_WIDTH_FRACTION),
    );
  });
});
