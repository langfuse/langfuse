import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createPeekPanelStore,
  PEEK_DEFAULT_WIDTH_FRACTION,
  PEEK_MAX_WIDGET_WIDTH_FRACTION,
  PEEK_MIN_WIDTH_FRACTION,
  selectDraftExpanded,
  selectWidgetWidth,
} from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";
const pct = (fraction: number) => `${fraction * 100}vw`;

describe("peekPanelStore", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("defaults to the widget width, not resizing or expanded", () => {
    const store = createPeekPanelStore();
    const state = store.getState();
    expect(state.isResizing).toBe(false);
    expect(state.draftExpanded).toBe(false);
    expect(state.widthFraction).toBeCloseTo(PEEK_DEFAULT_WIDTH_FRACTION);
    expect(selectWidgetWidth(state)).toBe(pct(PEEK_DEFAULT_WIDTH_FRACTION));
  });

  it("reads and clamps the persisted width on creation", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.7");
    expect(createPeekPanelStore().getState().widthFraction).toBeCloseTo(0.7);

    window.localStorage.setItem(STORAGE_KEY, "5");
    expect(createPeekPanelStore().getState().widthFraction).toBeCloseTo(
      PEEK_MAX_WIDGET_WIDTH_FRACTION,
    );
  });

  it("commitWidth clamps, persists, and clears the draft", () => {
    const store = createPeekPanelStore();
    store.getState().actions.setDraftExpanded();
    store.getState().actions.commitWidth(0.72);
    const state = store.getState();
    expect(state.widthFraction).toBeCloseTo(0.72);
    expect(state.draftFraction).toBeNull();
    expect(state.draftExpanded).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.72");
  });

  it("setDraftFraction drives the live widget width (and clears draftExpanded)", () => {
    const store = createPeekPanelStore();
    store.getState().actions.setDraftExpanded();
    store.getState().actions.setDraftFraction(0.42);
    const state = store.getState();
    expect(state.draftExpanded).toBe(false);
    expect(selectWidgetWidth(state)).toBe(pct(0.42));
    // The committed width preference is untouched until pointer-up.
    expect(state.widthFraction).toBeCloseTo(PEEK_DEFAULT_WIDTH_FRACTION);
  });

  it("setDraftExpanded previews expansion without persisting a width", () => {
    const store = createPeekPanelStore();
    store.getState().actions.setDraftExpanded();
    expect(selectDraftExpanded(store.getState())).toBe(true);
    expect(store.getState().draftFraction).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("nudgeWidth grows/shrinks within bounds and persists", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const store = createPeekPanelStore();

    store.getState().actions.nudgeWidth("grow");
    expect(store.getState().widthFraction).toBeCloseTo(0.55);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.55");

    store.getState().actions.nudgeWidth("shrink");
    expect(store.getState().widthFraction).toBeCloseTo(0.5);
  });

  it("nudgeWidth never shrinks below the minimum", () => {
    window.localStorage.setItem(STORAGE_KEY, String(PEEK_MIN_WIDTH_FRACTION));
    const store = createPeekPanelStore();
    store.getState().actions.nudgeWidth("shrink");
    expect(store.getState().widthFraction).toBeCloseTo(PEEK_MIN_WIDTH_FRACTION);
  });

  it("cancelResize abandons the draft without committing a width", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const store = createPeekPanelStore();
    store.getState().actions.setResizing(true);
    store.getState().actions.setDraftFraction(0.8);
    store.getState().actions.cancelResize();
    const state = store.getState();
    expect(state.draftFraction).toBeNull();
    expect(state.draftExpanded).toBe(false);
    expect(state.isResizing).toBe(false);
    expect(state.widthFraction).toBeCloseTo(0.5);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.5");
  });
});
