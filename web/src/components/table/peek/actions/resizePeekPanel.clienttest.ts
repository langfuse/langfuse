import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beginPeekResize } from "@/src/components/table/peek/actions/resizePeekPanel";
import {
  createPeekPanelStore,
  selectDraftExpanded,
} from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";

// A primary-button pointerdown — the only kind that begins a drag.
const pointerDown = () =>
  ({ button: 0, preventDefault: () => {} }) as unknown as React.PointerEvent;

// The panel is docked right, so its width fraction is `1 - clientX/innerWidth`.
// Derive the clientX that yields a target fraction from the live viewport width.
const clientXForFraction = (fraction: number) =>
  Math.round((1 - fraction) * window.innerWidth);

const move = (clientX: number) =>
  window.dispatchEvent(new MouseEvent("pointermove", { clientX }));

describe("beginPeekResize", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("commits the dragged widget width to localStorage on pointer-up", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const store = createPeekPanelStore();
    const commitExpanded = vi.fn();

    beginPeekResize(store, pointerDown(), commitExpanded);
    move(clientXForFraction(0.7));
    window.dispatchEvent(new Event("pointerup"));

    expect(store.getState().widthFraction).toBeCloseTo(0.7);
    expect(
      parseFloat(window.localStorage.getItem(STORAGE_KEY) ?? ""),
    ).toBeCloseTo(0.7);
    expect(commitExpanded).toHaveBeenLastCalledWith(false);
    expect(store.getState().isResizing).toBe(false);
  });

  it("aborts on pointercancel WITHOUT committing the width or expanding", () => {
    // pointercancel is a system abort (palm rejection, gesture intercept, OS
    // interrupt), not a release — the saved width must survive untouched.
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const store = createPeekPanelStore();
    const commitExpanded = vi.fn();

    beginPeekResize(store, pointerDown(), commitExpanded);
    move(clientXForFraction(0.7)); // would persist 0.7 on a real pointer-up
    window.dispatchEvent(new Event("pointercancel"));

    expect(store.getState().widthFraction).toBeCloseTo(0.5);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.5");
    expect(commitExpanded).not.toHaveBeenCalled();
    expect(store.getState().draftFraction).toBeNull();
    expect(store.getState().isResizing).toBe(false);
  });

  it("flips to expanded at the sidebar-aligned threshold (not the static 0.95)", () => {
    const store = createPeekPanelStore();
    const commitExpanded = vi.fn();
    // Sidebar edge at fraction 0.8 → dragging to 0.85 expands, no overshoot.
    beginPeekResize(store, pointerDown(), commitExpanded, 0.8);
    move(clientXForFraction(0.85));
    expect(selectDraftExpanded(store.getState())).toBe(true);
    window.dispatchEvent(new Event("pointerup"));
    expect(commitExpanded).toHaveBeenLastCalledWith(true);
  });

  it("removes its window listeners after a cancelled drag", () => {
    const store = createPeekPanelStore();
    const commitExpanded = vi.fn();

    beginPeekResize(store, pointerDown(), commitExpanded);
    window.dispatchEvent(new Event("pointercancel"));
    // A stray move after teardown must not revive draft state.
    move(clientXForFraction(0.7));
    expect(store.getState().draftFraction).toBeNull();
  });
});
