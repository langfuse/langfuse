import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordIncrement = vi.fn();

vi.mock("./instrumentation", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
}));
vi.mock("./logger", () => ({
  logger: { error: vi.fn() },
}));

import type { ProcessErrorHandlerOptions } from "./processErrorHandlers";

const OUR_LISTENER_NAMES = ["onUnhandledRejection", "onUncaughtException"];

type ProcessEvent = "unhandledRejection" | "uncaughtException";

// process.listeners is typed against NodeJS.Signals; cast so a plain event
// name variable is accepted. The runtime value is the real event string.
const listenersFor = (
  event: ProcessEvent,
): Array<(...args: unknown[]) => void> =>
  process.listeners(event as NodeJS.Signals) as unknown as Array<
    (...args: unknown[]) => void
  >;

const removeOurListeners = () => {
  for (const event of ["unhandledRejection", "uncaughtException"] as const) {
    for (const listener of listenersFor(event)) {
      if (OUR_LISTENER_NAMES.includes(listener.name)) {
        process.removeListener(event as NodeJS.Signals, listener as never);
      }
    }
  }
};

// Freshly load the module (its `installed`/`draining` state is module-level)
// and install with the given options.
async function freshInstall(options: ProcessErrorHandlerOptions) {
  vi.resetModules();
  const mod = await import("./processErrorHandlers.js");
  mod.installProcessErrorHandlers(options);
  return mod;
}

// Invoke our registered handler directly instead of process.emit(), so the
// test never risks killing the runner or tripping the framework's own
// unhandledRejection/uncaughtException listeners.
const fire = (event: ProcessEvent, reason: unknown) => {
  const name =
    event === "unhandledRejection"
      ? "onUnhandledRejection"
      : "onUncaughtException";
  const listener = listenersFor(event).find((l) => l.name === name);
  if (!listener) {
    throw new Error(`no ${name} listener registered`);
  }
  listener(reason, Promise.resolve());
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe("installProcessErrorHandlers", () => {
  beforeEach(() => {
    recordIncrement.mockClear();
  });

  afterEach(() => {
    removeOurListeners();
  });

  it("registers each listener only once", async () => {
    const mod = await freshInstall({ exit: vi.fn() });
    const count = (event: ProcessEvent) =>
      listenersFor(event).filter((l) => OUR_LISTENER_NAMES.includes(l.name))
        .length;

    expect(count("unhandledRejection")).toBe(1);
    expect(count("uncaughtException")).toBe(1);

    mod.installProcessErrorHandlers({ exit: vi.fn() });

    expect(count("unhandledRejection")).toBe(1);
    expect(count("uncaughtException")).toBe(1);
  });

  it("drains then exits non-zero on an unhandled rejection", async () => {
    const exit = vi.fn();
    const onFatal = vi.fn().mockResolvedValue(undefined);
    await freshInstall({ onFatal, exit });

    fire("unhandledRejection", new Error("leaked"));
    await flush();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatchObject({
      source: "unhandledRejection",
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.process.unhandled_rejection",
      1,
    );
  });

  it("drains then exits non-zero on an uncaught exception", async () => {
    const exit = vi.fn();
    const onFatal = vi.fn().mockResolvedValue(undefined);
    await freshInstall({ onFatal, exit });

    fire("uncaughtException", new Error("boom"));
    await flush();

    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0][0]).toMatchObject({
      source: "uncaughtException",
    });
    expect(exit).toHaveBeenCalledWith(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.process.uncaught_exception",
      1,
    );
  });

  it("still exits once when the drain itself rejects", async () => {
    const exit = vi.fn();
    const onFatal = vi.fn().mockRejectedValue(new Error("drain failed"));
    await freshInstall({ onFatal, exit });

    fire("unhandledRejection", new Error("leaked"));
    await flush();

    expect(exit).toHaveBeenCalledWith(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("force-exits immediately on a repeated fatal while still draining", async () => {
    const exit = vi.fn();
    let releaseDrain: () => void = () => {};
    const onFatal = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseDrain = resolve;
        }),
    );
    await freshInstall({ onFatal, exit });

    // First fatal: drain starts, no exit yet.
    fire("unhandledRejection", new Error("first"));
    await flush();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    // Second fatal mid-drain: force exit immediately, without re-draining.
    fire("uncaughtException", new Error("second"));
    expect(exit).toHaveBeenCalledWith(1);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.process.forced_exit",
      1,
    );

    releaseDrain();
  });

  it("force-exits when the drain exceeds the timeout budget", async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      const onFatal = vi.fn(() => new Promise<void>(() => {})); // never resolves
      await freshInstall({ onFatal, exit, drainTimeoutMs: 1_000 });

      fire("unhandledRejection", new Error("leaked"));
      expect(exit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
