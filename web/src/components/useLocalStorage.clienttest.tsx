import { act, render, renderHook, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import useLocalStorage from "@/src/components/useLocalStorage";

const SHARED_KEY = "test-shared-pref-key";

/**
 * One component holding the shared preference. Two of these side by side is the
 * real shape: a page and a panel inside it both read the same key.
 */
const Subscriber = ({
  register,
}: {
  register?: (setValue: (value: string) => void) => void;
}) => {
  const [value, setValue] = useLocalStorage(SHARED_KEY, "initial");
  useEffect(() => register?.(setValue), [register, setValue]);
  return <span>{value}</span>;
};

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

  // Two instances of the key on one page: setting it from one must reach the
  // other WITHOUT setting state on it mid-render. React runs a state updater
  // during the render phase, so a side effect in there (the same-tab notify)
  // updates every other subscriber while a component is rendering — benign as
  // a warning, and one dependency away from an update loop.
  it("reaches the other instances of the key without updating them during a render", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let setFromFirst: ((value: string) => void) | undefined;

    render(
      <>
        <Subscriber register={(setValue) => (setFromFirst = setValue)} />
        <Subscriber />
      </>,
    );

    // Two writes in one batch, because React evaluates a lone updater eagerly
    // (outside the render phase) to check for a bail-out. With an update
    // already queued it runs the updater during the render instead — which is
    // what a real interaction does, where the same click also moves other state.
    act(() => {
      setFromFirst?.("first");
      setFromFirst?.("updated");
    });

    expect(screen.getAllByText("updated")).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
