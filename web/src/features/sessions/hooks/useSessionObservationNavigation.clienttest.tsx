import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionObservationNavigation } from "./useSessionObservationNavigation";

describe("useSessionObservationNavigation", () => {
  it("falls back when the selected observation never mounts", () => {
    vi.useFakeTimers();
    try {
      const feed = document.createElement("div");
      const onObservationNotFound = vi.fn();
      const { result, unmount } = renderHook(() =>
        useSessionObservationNavigation({
          feedRef: { current: feed },
          selectTrace: vi.fn(),
          onObservationNotFound,
        }),
      );

      act(() => result.current(2, "missing-observation"));
      expect(onObservationNotFound).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(5_000));

      expect(onObservationNotFound).toHaveBeenCalledExactlyOnceWith(
        2,
        "missing-observation",
      );
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the fallback when another trace is selected", () => {
    vi.useFakeTimers();
    try {
      const feed = document.createElement("div");
      const onObservationNotFound = vi.fn();
      const { result, unmount } = renderHook(() =>
        useSessionObservationNavigation({
          feedRef: { current: feed },
          selectTrace: vi.fn(),
          onObservationNotFound,
        }),
      );

      act(() => result.current(2, "missing-observation"));
      act(() => result.current(1, undefined));
      act(() => vi.advanceTimersByTime(5_000));

      expect(onObservationNotFound).not.toHaveBeenCalled();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("selects the trace and centers a mounted observation", () => {
    const feed = document.createElement("div");
    const observation = document.createElement("div");
    observation.dataset.sessionObservationId = "observation";
    feed.append(observation);
    Object.defineProperty(feed, "clientHeight", { value: 400 });
    Object.defineProperty(observation, "clientHeight", { value: 100 });
    vi.spyOn(observation, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 500, 100, 100),
    );
    const scrollTo = vi.fn();
    feed.scrollTo = scrollTo;
    const selectTrace = vi.fn();
    const { result } = renderHook(() =>
      useSessionObservationNavigation({
        feedRef: { current: feed },
        selectTrace,
      }),
    );

    act(() => result.current(2, "observation"));

    expect(selectTrace).toHaveBeenCalledWith(2);
    expect(scrollTo).toHaveBeenCalledWith({ top: 350, behavior: "smooth" });
  });

  it("waits for the selected observation to mount", async () => {
    const feed = document.createElement("div");
    const scrollTo = vi.fn();
    feed.scrollTo = scrollTo;
    const { result } = renderHook(() =>
      useSessionObservationNavigation({
        feedRef: { current: feed },
        selectTrace: vi.fn(),
      }),
    );

    act(() => result.current(0, "lazy-observation"));
    expect(scrollTo).not.toHaveBeenCalled();

    const observation = document.createElement("div");
    observation.dataset.sessionObservationId = "lazy-observation";
    feed.append(observation);

    await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce());
  });

  it("cancels pending observation scrolling when a trace is selected", async () => {
    const feed = document.createElement("div");
    const scrollTo = vi.fn();
    feed.scrollTo = scrollTo;
    const selectTrace = vi.fn();
    const { result } = renderHook(() =>
      useSessionObservationNavigation({
        feedRef: { current: feed },
        selectTrace,
      }),
    );

    act(() => result.current(0, "old-observation"));
    act(() => result.current(1, undefined));
    const observation = document.createElement("div");
    observation.dataset.sessionObservationId = "old-observation";
    feed.append(observation);
    await Promise.resolve();

    expect(selectTrace).toHaveBeenLastCalledWith(1);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
