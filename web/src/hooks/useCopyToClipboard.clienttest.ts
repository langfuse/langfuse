import { act, renderHook } from "@testing-library/react";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

describe("useCopyToClipboard", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("copies the provided text and exposes a temporary success state", async () => {
    const { result } = renderHook(() =>
      useCopyToClipboard({ successDuration: 500 }),
    );

    expect(result.current.isCopied).toBe(false);

    await act(async () => {
      await result.current.copy("pk-lf-test");
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it("resets the success timeout when copy is triggered again", async () => {
    const { result } = renderHook(() =>
      useCopyToClipboard({ successDuration: 500 }),
    );

    await act(async () => {
      await result.current.copy("first");
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      await result.current.copy("second");
    });

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it("resets copied state after a failed clipboard write", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("NotAllowedError"));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const { result } = renderHook(() =>
      useCopyToClipboard({ successDuration: 500 }),
    );

    await act(async () => {
      await expect(result.current.copy("pk-lf-test")).rejects.toThrow(
        "NotAllowedError",
      );
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it("keeps the active copied state across rerenders and preserves the original timeout", async () => {
    const { result, rerender } = renderHook(
      ({ successDuration }) => useCopyToClipboard({ successDuration }),
      {
        initialProps: { successDuration: 500 },
      },
    );

    await act(async () => {
      await result.current.copy("first");
    });

    expect(result.current.isCopied).toBe(true);

    rerender({ successDuration: 2_000 });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.isCopied).toBe(false);
  });
});
