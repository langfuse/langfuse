import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a pending call when cancelled", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, 500, false));

    act(() => {
      result.current("stale");
      result.current.cancel();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(fn).not.toHaveBeenCalled();
  });
});
