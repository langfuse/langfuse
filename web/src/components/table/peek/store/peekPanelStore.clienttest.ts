import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createPeekPanelStore,
  PEEK_DEFAULT_WIDTH_FRACTION,
  PEEK_MAX_WIDGET_WIDTH_FRACTION,
  PEEK_MIN_WIDTH_FRACTION,
  selectWidth,
} from "@/src/components/table/peek/store/peekPanelStore";

const STORAGE_KEY = "peekViewWidthFraction";
const pct = (fraction: number) => `${fraction * 100}vw`;

describe("peekPanelStore", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("defaults to the widget width and is not fullscreen", () => {
    const store = createPeekPanelStore();
    const state = store.getState();
    expect(state.isFullscreen).toBe(false);
    expect(state.widthFraction).toBeCloseTo(PEEK_DEFAULT_WIDTH_FRACTION);
    expect(selectWidth(state)).toBe(pct(PEEK_DEFAULT_WIDTH_FRACTION));
  });

  it("reads and clamps the persisted width on creation", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.7");
    expect(createPeekPanelStore().getState().widthFraction).toBeCloseTo(0.7);

    window.localStorage.setItem(STORAGE_KEY, "5");
    expect(createPeekPanelStore().getState().widthFraction).toBeCloseTo(
      PEEK_MAX_WIDGET_WIDTH_FRACTION,
    );
  });

  it("commitWidth clamps, persists, and clears the draft + fullscreen", () => {
    const store = createPeekPanelStore();
    store.getState().actions.enterFullscreenDraft();
    store.getState().actions.commitWidth(0.72);
    const state = store.getState();
    expect(state.widthFraction).toBeCloseTo(0.72);
    expect(state.draftFraction).toBeNull();
    expect(state.isFullscreen).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.72");
  });

  it("setDraftFraction drives the live width and leaves fullscreen", () => {
    const store = createPeekPanelStore();
    store.getState().actions.enterFullscreenDraft();
    store.getState().actions.setDraftFraction(0.42);
    const state = store.getState();
    expect(state.isFullscreen).toBe(false);
    expect(selectWidth(state)).toBe(pct(0.42));
    // The committed width preference is untouched until pointer-up.
    expect(state.widthFraction).toBeCloseTo(PEEK_DEFAULT_WIDTH_FRACTION);
  });

  it("enterFullscreenDraft renders 100vw without persisting a width", () => {
    const store = createPeekPanelStore();
    store.getState().actions.enterFullscreenDraft();
    expect(selectWidth(store.getState())).toBe("100vw");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("toggleFullscreen flips and falls back to the persisted widget width", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.65");
    const store = createPeekPanelStore();
    store.getState().actions.toggleFullscreen();
    expect(selectWidth(store.getState())).toBe("100vw");
    store.getState().actions.toggleFullscreen();
    expect(selectWidth(store.getState())).toBe(pct(0.65));
  });

  it("nudgeWidth bases off the persisted width (even from fullscreen) and clamps", () => {
    window.localStorage.setItem(STORAGE_KEY, "0.5");
    const store = createPeekPanelStore();
    store.getState().actions.toggleFullscreen();

    // Exits fullscreen relative to 0.5, not the fullscreen ceiling.
    store.getState().actions.nudgeWidth("shrink");
    expect(store.getState().isFullscreen).toBe(false);
    expect(store.getState().widthFraction).toBeCloseTo(0.45);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0.45");

    store.getState().actions.nudgeWidth("grow");
    expect(store.getState().widthFraction).toBeCloseTo(0.5);
  });

  it("nudgeWidth never shrinks below the minimum", () => {
    window.localStorage.setItem(STORAGE_KEY, String(PEEK_MIN_WIDTH_FRACTION));
    const store = createPeekPanelStore();
    store.getState().actions.nudgeWidth("shrink");
    expect(store.getState().widthFraction).toBeCloseTo(PEEK_MIN_WIDTH_FRACTION);
  });

  it("resetForVisibility clears fullscreen on close, no-ops while open", () => {
    const store = createPeekPanelStore();
    store.getState().actions.toggleFullscreen();

    store.getState().actions.resetForVisibility(true);
    expect(store.getState().isFullscreen).toBe(true);

    store.getState().actions.resetForVisibility(false);
    expect(store.getState().isFullscreen).toBe(false);
  });
});
