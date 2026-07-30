import { act, renderHook } from "@testing-library/react";
import { useColumnSizing } from "./useColumnSizing";

const STORAGE_KEY = "table-columns-experiment-grid";

describe("useColumnSizing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("persists resetting the last custom column width", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ experiment_0: 700 }),
    );

    const { result, unmount } = renderHook(() =>
      useColumnSizing("experiment-grid"),
    );

    act(() => {
      result.current.setColumnSizing({});
    });
    unmount();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{}");
  });

  it("immediately persists resetting one of multiple custom widths", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ experiment_0: 700, experiment_1: 650 }),
    );

    const { result, unmount } = renderHook(() =>
      useColumnSizing("experiment-grid"),
    );

    act(() => {
      result.current.setColumnSizing({ experiment_1: 650 });
    });
    unmount();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ experiment_1: 650 }),
    );
  });
});
