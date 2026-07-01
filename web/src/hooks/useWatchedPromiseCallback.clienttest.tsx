import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe("useWatchedPromiseCallback", () => {
  it("tracks loading state and reuses the in-flight promise", async () => {
    const deferred = createDeferred<string>();
    const callback = vi.fn().mockReturnValue(deferred.promise);

    const { result } = renderHook(() =>
      useWatchedPromiseCallback(callback, []),
    );

    let firstPromise!: Promise<unknown>;
    let secondPromise!: Promise<unknown>;

    act(() => {
      firstPromise = result.current[0]("first");
      secondPromise = result.current[0]("second");
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("first");
    expect(secondPromise).toBe(firstPromise);
    expect(result.current[1]).toBe(true);

    await act(async () => {
      deferred.resolve("done");
      await firstPromise;
    });

    await waitFor(() => {
      expect(result.current[1]).toBe(false);
    });
  });

  it("clears loading state after a rejection", async () => {
    const deferred = createDeferred<string>();
    const callback = vi.fn().mockReturnValue(deferred.promise);

    const { result } = renderHook(() =>
      useWatchedPromiseCallback(callback, []),
    );

    let promise!: Promise<unknown>;

    act(() => {
      promise = result.current[0]("first");
    });

    expect(result.current[1]).toBe(true);

    await act(async () => {
      deferred.reject(new Error("boom"));
      await expect(promise).rejects.toThrow("boom");
    });

    await waitFor(() => {
      expect(result.current[1]).toBe(false);
    });
  });

  it("allows a new invocation after the previous promise resolves", async () => {
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();
    const callback = vi
      .fn()
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise);

    const { result } = renderHook(() =>
      useWatchedPromiseCallback(callback, []),
    );

    let firstPromise!: Promise<unknown>;
    let secondPromise!: Promise<unknown>;

    act(() => {
      firstPromise = result.current[0]("first");
    });

    await act(async () => {
      firstDeferred.resolve("done");
      await firstPromise;
    });

    await waitFor(() => {
      expect(result.current[1]).toBe(false);
    });

    act(() => {
      secondPromise = result.current[0]("second");
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, "first");
    expect(callback).toHaveBeenNthCalledWith(2, "second");
    expect(secondPromise).not.toBe(firstPromise);
    expect(result.current[1]).toBe(true);

    await act(async () => {
      secondDeferred.resolve("done-again");
      await secondPromise;
    });

    await waitFor(() => {
      expect(result.current[1]).toBe(false);
    });
  });

  it("clears loading state correctly in Strict Mode", async () => {
    const deferred = createDeferred<string>();
    const callback = vi.fn().mockReturnValue(deferred.promise);

    const { result } = renderHook(
      () => useWatchedPromiseCallback(callback, []),
      {
        wrapper: StrictMode,
      },
    );

    let promise!: Promise<unknown>;

    act(() => {
      promise = result.current[0]("first");
    });

    expect(result.current[1]).toBe(true);

    await act(async () => {
      deferred.resolve("done");
      await promise;
    });

    await waitFor(() => {
      expect(result.current[1]).toBe(false);
    });
  });
});
