import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePeekPanelState } from "@/src/components/table/peek/usePeekPanelState";
import { PEEK_DEFAULT_WIDTH_FRACTION } from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";
// Widget width is `min(<n>vw, calc(100vw - <sidebar>px))` — pull the leading
// vw fraction (the widget's own width) out of the min() wrapper.
const widthFraction = (style: React.CSSProperties) => {
  const match = String(style.width).match(/([\d.]+)vw/);
  return match ? parseFloat(match[1]) / 100 : NaN;
};

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
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("measures a late layout target, follows its resize, and preserves a user resize", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.8");
    let resized: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    let targetWidth = window.innerWidth * 0.32;
    const target = document.createElement("section");
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(
      () => ({ width: targetWidth }) as DOMRect,
    );
    const { result, rerender } = renderHook(
      ({ target }: { target: HTMLElement | null }) =>
        usePeekPanelState({
          isOpen: true,
          isExpanded: false,
          onExpandedChange: vi.fn(),
          defaultWidthTarget: target,
          widthStorageKey: "peek-width-topics",
        }),
      { initialProps: { target: null as HTMLElement | null } },
    );
    rerender({ target });
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.32);

    targetWidth = window.innerWidth * 0.45;
    act(() => resized?.());
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.45);

    pressArrow(result, "ArrowLeft");
    targetWidth = window.innerWidth * 0.35;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.5);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.8");
    expect(window.localStorage.getItem("peek-width-topics")).toBe("0.5");
  });

  it("restores a narrow layout preference before its target mounts", () => {
    window.localStorage.setItem("peek-width-topics", "0.35");
    const target = document.createElement("section");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      width: window.innerWidth * 0.45,
    } as DOMRect);
    const { result, rerender } = renderHook(
      ({ target }: { target: HTMLElement | null }) =>
        usePeekPanelState({
          isOpen: true,
          isExpanded: false,
          onExpandedChange: vi.fn(),
          defaultWidthTarget: target,
          widthStorageKey: "peek-width-topics",
        }),
      { initialProps: { target: null as HTMLElement | null } },
    );
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.35);
    rerender({ target });
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.35);
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.35);
    expect(result.current.resizeHandleProps["aria-valuemin"]).toBe(35);
    pressArrow(result, "ArrowLeft");
    pressArrow(result, "ArrowRight");
    expect(widthFraction(result.current.panelStyle)).toBeCloseTo(0.35);
  });

  it("toggleExpanded writes the expanded flag (URL) via the callback", () => {
    const { result, onExpandedChange } = setup(false);
    act(() => result.current.toggleExpanded());
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it("toggleExpanded toggles against the displayed (pending) state, not the stale URL prop", () => {
    const { result, onExpandedChange } = setup(false);
    // First click commits expanded; the hook holds it as `pending` until the
    // URL (isExpanded prop) catches up — we deliberately do NOT rerender it.
    act(() => result.current.toggleExpanded());
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    expect(result.current.isExpanded).toBe(true); // button now shows Collapse
    // A rapid second click in that pending window must collapse (match the
    // button), not re-commit `true` against the stale prop (a no-op).
    act(() => result.current.toggleExpanded());
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
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
