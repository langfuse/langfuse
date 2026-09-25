import { copyTextToClipboard } from "@/src/utils/clipboard";

describe("copyTextToClipboard", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    vi.restoreAllMocks();
  });

  it("uses writeText when it succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard("trace-id")).resolves.toBeUndefined();

    expect(writeText).toHaveBeenCalledWith("trace-id");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when writeText is rejected", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException("Write denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard("trace-id")).resolves.toBeUndefined();

    expect(writeText).toHaveBeenCalledWith("trace-id");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
