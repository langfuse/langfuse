import { beforeEach, describe, expect, it, vi } from "vitest";

const recordIncrement = vi.fn();

vi.mock("./instrumentation", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
}));
vi.mock("./logger", () => ({
  logger: { error: vi.fn() },
}));

import { installUnhandledRejectionCapture } from "./processErrorHandlers";

describe("installUnhandledRejectionCapture", () => {
  beforeEach(() => {
    recordIncrement.mockClear();
  });

  it("registers the listener only once", () => {
    const captureListeners = () =>
      process
        .listeners("unhandledRejection")
        .filter((listener) => listener.name === "onUnhandledRejection");

    installUnhandledRejectionCapture();
    expect(captureListeners()).toHaveLength(1);
    installUnhandledRejectionCapture();
    expect(captureListeners()).toHaveLength(1);
  });

  it("records a metric when an unhandledRejection is emitted", () => {
    installUnhandledRejectionCapture();

    const emitted = process.emit(
      "unhandledRejection",
      new Error("leaked"),
      Promise.resolve(),
    );

    expect(emitted).toBe(true);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.process.unhandled_rejection",
      1,
    );
  });
});
