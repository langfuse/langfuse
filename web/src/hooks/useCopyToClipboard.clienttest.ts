import { act, renderHook } from "@testing-library/react";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

describe("useCopyToClipboard", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
      vi.advanceTimersByTime(499);
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.isCopied).toBe(false);

    await act(async () => {
      await result.current.copy("pk-lf-test");
    });

    expect(result.current.isCopied).toBe(true);
  });

  it("falls back to plain text when the browser rejects a rich clipboard write", async () => {
    const write = vi.fn().mockRejectedValue(new Error("unsupported type"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText },
    });
    vi.stubGlobal("ClipboardItem", class ClipboardItemStub {});

    const { result } = renderHook(() =>
      useCopyToClipboard({ successDuration: 500 }),
    );

    await act(async () => {
      await result.current.copyRich({
        text: "The reranker is the bottleneck.",
        html: "<p>The reranker is the bottleneck.</p>",
      });
    });

    // The success state is only honest because the plain-text write landed.
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("The reranker is the bottleneck.");
    expect(result.current.isCopied).toBe(true);

    vi.unstubAllGlobals();
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
      vi.advanceTimersByTime(499);
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.isCopied).toBe(false);
  });
});
