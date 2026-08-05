import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useLocalStorage from "@/src/components/useLocalStorage";

// Seam contract for preference persistence: a localStorage write that throws
// (quota exceeded, Safari private mode) must not propagate an exception and
// must not log at error level — the Sentry console integration turns
// console.error into events (the QuotaExceededError issue family).
describe("useLocalStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("persists the value when the write succeeds", () => {
    const { result } = renderHook(() =>
      useLocalStorage("test-pref-key", "initial"),
    );

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(localStorage.getItem("test-pref-key")).toBe(
      JSON.stringify("updated"),
    );
  });

  it("does not throw and warns (not errors) when the write fails", () => {
    const { result } = renderHook(() =>
      useLocalStorage("test-pref-key", "initial"),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException(
        "Failed to execute 'setItem' on 'Storage'",
        "QuotaExceededError",
      );
    });

    expect(() => {
      act(() => {
        result.current[1]("updated");
      });
    }).not.toThrow();

    // The in-memory state still updates; only persistence is skipped.
    expect(result.current[0]).toBe("updated");
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
